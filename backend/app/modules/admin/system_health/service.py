import logging
import os
import platform
import re
import shutil
import smtplib
import socket
import ssl
import sys
import threading
import time
from datetime import date, datetime, timedelta
from importlib import metadata
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.core.cache import (
    invalidate,
    revalidate_target,
    revalidation_enabled,
    send_revalidate,
)
from app.core.config import PROJECT_ROOT, STORAGE_DIR, settings
from app.core.database import SessionLocal
from app.core.security import verify_password
from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.backups import runner, schedule
from app.modules.admin.backups.models import Backup
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role
from app.modules.admin.settings.service import get_group
from app.modules.admin.users.models import User
from app.shared.enums import Status
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)

OK, INFO, WARNING, ERROR = "ok", "info", "warning", "error"

GROUPS = [
    ("app", "Application", "server"),
    ("python", "Python", "code"),
    ("database", "Database", "database"),
    ("storage", "Storage & files", "hard-drive"),
    ("scheduler", "Scheduler", "clock"),
    ("mail", "Email", "mail"),
    ("backups", "Backups", "save"),
    ("security", "Security", "shield-check"),
]

PYTHON_SECURITY_ENDS = {
    "3.9": "2025-10-31", "3.10": "2026-10-31", "3.11": "2027-10-31",
    "3.12": "2028-10-31", "3.13": "2029-10-31", "3.14": "2030-10-31",
}
MIN_PYTHON = (3, 10)
KEY_PACKAGES = ["fastapi", "starlette", "pydantic", "sqlalchemy", "alembic", "psycopg2-binary", "uvicorn"]

DEFAULT_SECRET = "change-me-in-env"
try:
    from seeders.users import DEFAULT_PASSWORD
    from seeders.users import USERS as _SEEDED

    DEMO_EMAILS = [u[0] for u in _SEEDED]
except Exception:  # pragma: no cover
    DEFAULT_PASSWORD = "Password@123"
    DEMO_EMAILS = ["superadmin@gmail.com", "admin@gmail.com", "editor@gmail.com"]

UPLOADS_DIR = STORAGE_DIR / "uploads"
LOGS_DIR = STORAGE_DIR / "logs"
GB = 1024 ** 3
MB = 1024 ** 2

_SUMMARY_TTL = 300
_summary_cache: dict = {"at": 0.0, "value": None}
_summary_lock = threading.Lock()


def _check(key: str, label: str, status: str, value=None, message: str = "", hint: str | None = None) -> dict:
    return {"key": key, "label": label, "status": status, "value": None if value is None else str(value),
            "message": message, "hint": hint if status in (WARNING, ERROR, INFO) else None}


def _size(n: float | None) -> str:
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _ago(value: datetime | None) -> str:
    if not value:
        return "never"
    seconds = max(0, int((now() - value).total_seconds()))
    if seconds < 60:
        return "just now"
    for unit, size in (("day", 86400), ("hour", 3600), ("minute", 60)):
        if seconds >= size:
            n = seconds // size
            return f"{n} {unit}{'s' if n != 1 else ''} ago"
    return "just now"


def _worst(checks: list[dict]) -> str:
    statuses = {c["status"] for c in checks}
    return ERROR if ERROR in statuses else WARNING if WARNING in statuses else OK


def _is_https(url: str) -> bool:
    return (url or "").lower().startswith("https://")


def _is_local(url: str) -> bool:
    return any(h in (url or "") for h in ("localhost", "127.0.0.1", "0.0.0.0"))


def dir_size(path: Path, deadline: float | None = None) -> tuple[int, bool]:
    if not path.is_dir():
        return 0, True
    total = 0
    try:
        for root, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except OSError:
                    pass
            if deadline and time.monotonic() > deadline:
                return total, False
    except OSError:
        return total, False
    return total, True


def database_size(db: Session) -> int | None:
    try:
        return int(db.execute(text("select pg_database_size(current_database())")).scalar() or 0)
    except Exception:
        db.rollback()
        return None


def _app(db: Session) -> list[dict]:
    checks = []
    production = settings.is_production
    checks.append(_check("app.environment", "Environment", INFO, settings.APP_ENV,
                         "Running as the live site." if production else "Not marked as production (APP_ENV).",
                         None if production else "Set APP_ENV=production in .env on the live server."))

    checks.append(_check("app.timezone", "Timezone", INFO, schedule.site_zone(db).key,
                         "Times are stored in UTC and shown in this timezone (Settings -> Date & time). "
                         "Scheduled backups use it too."))

    for key, label, url, env in (("app.url", "API URL", settings.APP_URL, "APP_URL"),
                                 ("app.frontend_url", "Frontend URL", settings.FRONTEND_URL, "FRONTEND_URL")):
        if _is_https(url):
            checks.append(_check(key, label, OK, url, "Uses https."))
        elif production:
            checks.append(_check(key, label, WARNING, url, "Not https on the live site: logins and form data travel unencrypted.",
                                 f"Install an SSL certificate and set {env} to https://..."))
        else:
            checks.append(_check(key, label, INFO, url, "Fine while developing. Use https on the live site."))

    origins = settings.ALLOWED_ORIGINS
    if "*" in origins:
        checks.append(_check("app.cors", "CORS origins", ERROR if production else WARNING, "*",
                             "Any website can call the API from a browser.", "List the real frontend address(es) in ALLOWED_ORIGINS."))
    elif production and any(_is_local(o) for o in origins):
        checks.append(_check("app.cors", "CORS origins", WARNING, ", ".join(origins),
                             "Still allows local development addresses on the live site.",
                             "Set ALLOWED_ORIGINS to the real frontend address only."))
    elif settings.FRONTEND_URL.rstrip("/") not in [o.rstrip("/") for o in origins]:
        checks.append(_check("app.cors", "CORS origins", WARNING, ", ".join(origins) or "None",
                             f"FRONTEND_URL ({settings.FRONTEND_URL}) is not in the list, so the admin can't call the API from it.",
                             "Add FRONTEND_URL to ALLOWED_ORIGINS in .env."))
    else:
        checks.append(_check("app.cors", "CORS origins", OK, ", ".join(origins), "The frontend is allowed to call the API."))

    maintenance = get_group(db, "maintenance")
    checks.append(
        _check("app.maintenance", "Maintenance mode", WARNING, "On", "Visitors see the maintenance page.",
               "Turn it off in Settings -> Maintenance when you're done.")
        if maintenance.get("enabled") else _check("app.maintenance", "Maintenance mode", OK, "Off", "The site is open to visitors.")
    )
    checks.append(_website_cache())
    checks.append(_recent_errors())
    return checks


def _website_cache() -> dict:
    label = "Website cache refresh"
    if not settings.INTERNAL_API_KEY:
        return _check("app.cache", label, WARNING, "Off",
                      "Changes reach the website only when its cache expires (up to 10 minutes).",
                      "Set the same INTERNAL_API_KEY in the API .env and the frontend .env.local, then restart both.")
    if not revalidation_enabled():
        return _check("app.cache", label, WARNING, "Off", "Instant website refresh is turned off (WEBSITE_REVALIDATE).",
                      "Remove WEBSITE_REVALIDATE=off from .env.")
    if send_revalidate([], timeout=3.0):
        return _check("app.cache", label, OK, "On", f"Edits clear the website cache instantly ({revalidate_target()}).")
    return _check("app.cache", label, WARNING, revalidate_target(),
                  "The website didn't accept the refresh call, so changes show only when its cache expires.",
                  "Check that the frontend is running at FRONTEND_URL (or FRONTEND_INTERNAL_URL) and both "
                  "INTERNAL_API_KEY values match.")


_LOG_LINE = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[^\]]*\] (ERROR|CRITICAL) in \S+ \([^)]*\): (.*)$")


def _recent_errors() -> dict:
    today = datetime.now()
    since = today - timedelta(days=1)
    count, last = 0, None
    for day in (today, since):
        path = LOGS_DIR / f"app-{day.strftime('%Y-%m-%d')}.log"
        if not path.is_file():
            continue
        try:
            with path.open("rb") as handle:
                handle.seek(max(0, path.stat().st_size - 2 * MB))
                chunk = handle.read().decode("utf-8", "replace")
        except OSError:
            continue
        for line in chunk.splitlines():
            match = _LOG_LINE.match(line)
            if not match:
                continue
            try:
                at = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
            if at >= since:
                count += 1
                last = match.group(3)
    if not count:
        return _check("app.errors", "Errors in the log", OK, "None today", "No errors were logged in the last 24 hours.")
    return _check("app.errors", "Errors in the log", WARNING, f"{count} in 24 hours", f"Latest: {(last or '')[:160]}",
                  "Open Settings -> Logs to read them.")


def _python(db: Session) -> list[dict]:
    version = platform.python_version()
    branch = f"{sys.version_info.major}.{sys.version_info.minor}"
    ends = PYTHON_SECURITY_ENDS.get(branch)
    ends_on = date.fromisoformat(ends) if ends else None
    today = date.today()
    minimum = ".".join(map(str, MIN_PYTHON))
    if sys.version_info[:2] < MIN_PYTHON:
        checks = [_check("python.version", "Python version", ERROR, version, f"The app needs Python {minimum} or newer.",
                         f"Install Python {minimum}+ and recreate the virtual environment.")]
    elif ends_on and ends_on < today:
        checks = [_check("python.version", "Python version", WARNING, version,
                         f"Python {branch} stopped getting security fixes on {ends_on:%d %b %Y}.", "Upgrade to a newer Python version.")]
    elif ends_on and ends_on < today + timedelta(days=182):
        checks = [_check("python.version", "Python version", WARNING, version,
                         f"Works, but Python {branch} stops getting security fixes on {ends_on:%d %b %Y}.",
                         "Plan an upgrade to a newer Python version.")]
    else:
        checks = [_check("python.version", "Python version", OK, version,
                         f"Meets the app's requirement (Python {minimum}+)" + (f" and gets security fixes until {ends_on:%d %b %Y}." if ends_on else "."))]

    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    checks.append(_check("python.venv", "Virtual environment", OK if in_venv else WARNING,
                         "Active" if in_venv else "Not used", sys.prefix if in_venv else "Packages are installed system-wide.",
                         None if in_venv else "Create one with python -m venv venv and install requirements.txt into it."))

    installed = {}
    for name in KEY_PACKAGES:
        try:
            installed[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed[name] = None
    missing = [n for n, v in installed.items() if v is None]
    value = ", ".join(f"{n} {v}" for n, v in installed.items() if v)
    checks.append(
        _check("python.packages", "Key packages", ERROR, f"Missing: {', '.join(missing)}", "The API needs them to run.",
               "Run: pip install -r requirements.txt")
        if missing else _check("python.packages", "Key packages", OK, value, "Framework and database libraries are installed.")
    )

    mismatched = _requirement_mismatches()
    if mismatched is None:
        checks.append(_check("python.requirements", "requirements.txt", INFO, "Not found", "No requirements.txt to compare with."))
    elif mismatched:
        checks.append(_check("python.requirements", "requirements.txt", WARNING, f"{len(mismatched)} differ",
                             "Installed versions don't match requirements.txt: " + ", ".join(mismatched[:8]) + ("…" if len(mismatched) > 8 else ""),
                             "Run: pip install -r requirements.txt"))
    else:
        checks.append(_check("python.requirements", "requirements.txt", OK, "In sync", "Every pinned package is installed at that version."))
    return checks


def _requirement_mismatches() -> list[str] | None:
    path = PROJECT_ROOT / "requirements.txt"
    if not path.is_file():
        return None
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.match(r"^\s*([A-Za-z0-9_.\-]+)\s*==\s*([^\s;#]+)", line)
        if not match:
            continue
        name, wanted = match.groups()
        try:
            got = metadata.version(name)
        except metadata.PackageNotFoundError:
            out.append(f"{name} (missing)")
            continue
        if got != wanted:
            out.append(f"{name} {got} (wants {wanted})")
    return out


def _database(db: Session) -> list[dict]:
    try:
        version = db.execute(text("show server_version")).scalar() or "?"
        name = db.execute(text("select current_database()")).scalar()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return [_check("database.connection", "Connection", ERROR, "Failed", f"Could not connect: {str(exc)[:200]}",
                       "Check DATABASE_URL in .env and that PostgreSQL is running.")]
    checks = [_check("database.connection", "Connection", OK, f"PostgreSQL {str(version).split(' ')[0]}", f'Connected to "{name}".')]

    size = database_size(db)
    if size is not None:
        checks.append(_check("database.size", "Size", INFO, _size(size), "Tables and indexes together."))

    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        config = Config(str(PROJECT_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
        heads = set(ScriptDirectory.from_config(config).get_heads())
        current = set(MigrationContext.configure(db.connection()).get_current_heads())
        if current == heads:
            checks.append(_check("database.migrations", "Migrations", OK, "Up to date", "Every database change has been applied."))
        else:
            checks.append(_check("database.migrations", "Migrations", ERROR,
                                 f"At {', '.join(sorted(current)) or 'none'}, head is {', '.join(sorted(heads))}",
                                 "Parts of the app may break until the database is migrated.", "Run: alembic upgrade head"))
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        checks.append(_check("database.migrations", "Migrations", WARNING, "Unknown", f"Could not compare migrations: {str(exc)[:160]}"))
    return checks


def _storage(db: Session) -> list[dict]:
    checks = []
    try:
        usage = shutil.disk_usage(PROJECT_ROOT)
        percent = usage.free / usage.total * 100 if usage.total else 0
        value = f"{_size(usage.free)} free of {_size(usage.total)}"
        if percent < 5 or usage.free < 500 * MB:
            checks.append(_check("storage.disk", "Disk space", ERROR, value, "Almost full. Uploads, backups and logs will start failing.",
                                 "Delete old backups or logs, or add more space."))
        elif percent < 10 or usage.free < GB:
            checks.append(_check("storage.disk", "Disk space", WARNING, value, "Getting low.", "Delete old backups or logs, or add more space."))
        else:
            checks.append(_check("storage.disk", "Disk space", OK, value, f"{round(percent)}% free."))
    except OSError:
        checks.append(_check("storage.disk", "Disk space", INFO, "Unknown", "The server does not report disk space."))

    folders = {"storage/uploads": UPLOADS_DIR, "storage/logs": LOGS_DIR, "storage/backups": runner.BACKUP_DIR}
    not_writable = []
    for label, path in folders.items():
        target = path if path.exists() else path.parent
        if not os.access(target, os.W_OK):
            not_writable.append(label)
    checks.append(
        _check("storage.writable", "Writable folders", ERROR, "Not writable: " + ", ".join(not_writable),
               "Uploads, logging or backups will fail.", "Give the user running the API write permission to these folders.")
        if not_writable else _check("storage.writable", "Writable folders", OK, "All writable", "The API can save uploads, logs and backups.")
    )

    logs, _ = dir_size(LOGS_DIR, time.monotonic() + 3)
    checks.append(
        _check("storage.logs", "Log files", WARNING, _size(logs), "The logs folder is getting big.", "Delete old log files in Settings -> Logs.")
        if logs > 500 * MB else _check("storage.logs", "Log files", OK, _size(logs), "One file per day in storage/logs.")
    )
    return checks


def _scheduler(db: Session) -> list[dict]:
    beat = schedule.last_heartbeat(db)
    auto = bool(schedule.get_settings(db).get("enabled"))
    running = bool(beat and beat > now() - timedelta(minutes=10))
    needs = "Scheduled tasks (backups, trash clean-up, 404 log pruning, firewall clean-up) only run while it does."
    if running:
        status = _check("scheduler.running", "Status", OK, "Running", f"Last run {_ago(beat)}.")
    else:
        status = _check("scheduler.running", "Status", ERROR if auto else WARNING, "Stopped" if beat else "Not set up",
                        (f"Last run {_ago(beat)}. " if beat else "It has never run on this server. ") + needs
                        + (" Automatic backups are turned on but will not happen." if auto else ""),
                        "Run scheduler.py every minute with cron (Linux) or Task Scheduler (Windows); see the Backups page.")
    tasks = _check("scheduler.tasks", "Tasks", INFO, "4 tasks",
                   "Every minute: scheduled backup when due. Hourly checks: trash older than 30 days, "
                   "404 log entries not seen for 90 days, firewall housekeeping.")
    return [status, tasks]


def _mail(db: Session) -> list[dict]:
    cfg = get_group(db, "mail")
    if not cfg.get("enabled"):
        checks = [_check("mail.mailer", "Mailer", WARNING, "Off",
                         "Emails are written to the log file, not delivered: enquiry alerts and password resets never arrive.",
                         "Set up SMTP in Settings -> Email.")]
    elif not cfg.get("host"):
        checks = [_check("mail.mailer", "Mailer", ERROR, "No SMTP host", "Email is turned on but no server is set.",
                         "Fill in the SMTP host in Settings -> Email.")]
    else:
        checks = [_check("mail.mailer", "Mailer", OK, f"SMTP · {cfg.get('host')}:{cfg.get('port')}",
                         f"Encryption: {cfg.get('encryption') or 'none'}" + (", with login." if cfg.get("username") else ", no login."))]

    sender = (cfg.get("from_address") or cfg.get("username") or "").strip()
    if not sender:
        checks.append(_check("mail.from", "From address", ERROR if cfg.get("enabled") else INFO, "Not set",
                             "Emails cannot be sent without one.", "Set it in Settings -> Email."))
    elif sender.endswith(("@example.com", "@example.org", "@example.net")):
        checks.append(_check("mail.from", "From address", WARNING, sender,
                             "Still an example address, so mail servers will likely reject or junk it.", "Set a real address in Settings -> Email."))
    else:
        name = cfg.get("from_name")
        checks.append(_check("mail.from", "From address", OK, sender, "Emails are sent from this address" + (f' as "{name}".' if name else ".")))
    return checks


def _backups(db: Session) -> list[dict]:
    s = schedule.get_settings(db)
    auto = bool(s.get("enabled"))
    last = (db.query(Backup).filter(Backup.status == runner.COMPLETED)
            .order_by(Backup.finished_at.desc().nullslast()).first())
    latest = (db.query(Backup).filter(Backup.status.in_([runner.COMPLETED, runner.FAILED]))
              .order_by(Backup.id.desc()).first())

    if not last:
        checks = [_check("backups.last", "Last backup", WARNING, "Never", "There is no backup to restore from if something goes wrong.",
                         "Make one on the Backups page, and turn on automatic backups.")]
    elif last.finished_at and last.finished_at < now() - timedelta(days=7):
        checks = [_check("backups.last", "Last backup", WARNING, _ago(last.finished_at),
                         "Older than a week." + (" Check that the scheduler is running." if auto else ""),
                         None if auto else "Make a fresh backup, or turn on automatic backups.")]
    else:
        checks = [_check("backups.last", "Last backup", OK, _ago(last.finished_at), f"{_size(last.size)}, {last.name}.")]

    if latest and latest.status == runner.FAILED:
        checks.append(_check("backups.failed", "Latest attempt", WARNING, "Failed", (latest.error or "The last backup did not finish.")[:200],
                             "Open the Backups page for details."))

    checks.append(_check("backups.auto", "Automatic backups", OK if auto else INFO, "On" if auto else "Off",
                         f"{schedule.describe(db, s)}." if auto else "Backups are only made when someone clicks \"Make backup now\".",
                         None if auto else "Turn them on in the Backups page."))

    binary = runner.find_pg_dump()
    if binary:
        checks.append(_check("backups.pg_dump", "pg_dump", OK, runner.pg_dump_version(binary) or "Found", binary))
    else:
        checks.append(_check("backups.pg_dump", "pg_dump", ERROR if (auto and s.get("include_database")) else WARNING, "Not found",
                             "Database backups can't run without the PostgreSQL client tools.",
                             "Install them (postgresql-client), add them to PATH, or set PG_DUMP_PATH in .env."))
    return checks


def _security(db: Session) -> list[dict]:
    production = settings.is_production
    checks = []

    key = settings.SECRET_KEY or ""
    if key == DEFAULT_SECRET or not key:
        checks.append(_check("security.secret_key", "Secret key", ERROR, "Default",
                             "Anyone who knows the default can forge sign-in tokens.",
                             "Set SECRET_KEY in .env: python -c \"import secrets; print(secrets.token_urlsafe(48))\""))
    elif len(key) < 32:
        checks.append(_check("security.secret_key", "Secret key", WARNING, f"{len(key)} characters",
                             "Too short to be safe against guessing.", "Use at least 32 random characters for SECRET_KEY."))
    else:
        checks.append(_check("security.secret_key", "Secret key", OK, "Set", "Sign-in tokens are signed with a strong key."))

    if settings.DEBUG and production:
        checks.append(_check("security.debug", "Debug mode", ERROR, "On", "Debug output can reveal code and settings on the live site.",
                             "Set DEBUG=false in .env."))
    elif settings.DEBUG:
        checks.append(_check("security.debug", "Debug mode", INFO, "On", "Fine while developing. It turns off when APP_ENV=production."))
    else:
        checks.append(_check("security.debug", "Debug mode", OK, "Off", "Errors are logged, not shown."))

    docs_open = not production
    checks.append(
        _check("security.docs", "API docs", INFO, "/docs open", "Swagger docs are available while not in production. They are hidden when APP_ENV=production.")
        if docs_open else _check("security.docs", "API docs", OK, "Hidden", "/docs and /openapi.json are off on the live site.")
    )

    lockout = get_group(db, "security")
    checks.append(
        _check("security.lockout", "Account lockout", OK, "On",
               f"Locked for {lockout.get('lockout_minutes')} minutes after {lockout.get('lockout_attempts')} failed sign-ins.")
        if lockout.get("lockout_enabled") else
        _check("security.lockout", "Account lockout", WARNING, "Off", "Passwords can be guessed without limit.",
               "Turn it on in Settings -> Security.")
    )

    supers = (db.query(User).join(Role, User.role_id == Role.id)
              .filter(Role.name == SUPER_ADMIN_ROLE, User.status == Status.ACTIVE.value, User.not_deleted()).all())
    without = [u for u in supers if not u.two_factor_enabled]
    if not supers:
        checks.append(_check("security.two_factor", "Super admin 2FA", INFO, "No super admins", "No active super admin accounts."))
    elif without:
        checks.append(_check("security.two_factor", "Super admin 2FA", WARNING, f"{len(without)} of {len(supers)} without",
                             "Super admins without two-factor sign-in: " + ", ".join(u.email for u in without[:5]) + ".",
                             "Turn on two-factor sign-in in Profile -> Security, or require it for the role."))
    else:
        checks.append(_check("security.two_factor", "Super admin 2FA", OK, "Everyone", "Every super admin uses two-factor sign-in."))

    demo = (db.query(User).options(joinedload(User.role))
            .filter(User.email.in_(DEMO_EMAILS), User.status == Status.ACTIVE.value, User.not_deleted()).all())
    weak = [u.email for u in demo if verify_password(DEFAULT_PASSWORD, u.password)]
    checks.append(
        _check("security.demo_passwords", "Demo accounts", ERROR, f"{len(weak)} with the default password",
               f"{', '.join(weak)} still sign in with the seeded password, which is public.",
               "Change their passwords, or delete the demo accounts you don't need.")
        if weak else _check("security.demo_passwords", "Demo accounts", OK, "Safe", "No active demo account uses the default password.")
    )
    return checks


_RUNNERS = {"app": _app, "python": _python, "database": _database, "storage": _storage, "scheduler": _scheduler,
            "mail": _mail, "backups": _backups, "security": _security}


def run_checks(db: Session) -> dict:
    groups = []
    for key, label, icon in GROUPS:
        try:
            checks = _RUNNERS[key](db)
        except Exception as exc:  # noqa: BLE001
            logger.exception("System health group %s failed", key)
            db.rollback()
            checks = [_check(f"{key}.failed", "Check", ERROR, None, f"This check could not run: {str(exc)[:200]}")]
        groups.append({"key": key, "label": label, "icon": icon, "status": _worst(checks), "checks": checks})

    statuses = [c["status"] for g in groups for c in g["checks"]]
    summary = {
        "status": ERROR if ERROR in statuses else WARNING if WARNING in statuses else OK,
        "ok": statuses.count(OK),
        "warnings": statuses.count(WARNING),
        "errors": statuses.count(ERROR),
        "info": statuses.count(INFO),
        "total": len(statuses),
        "checked_at": iso(now()),
    }
    with _summary_lock:
        _summary_cache.update(at=time.monotonic(), value={"errors": summary["errors"], "warnings": summary["warnings"],
                                                          "checked_at": summary["checked_at"]})
    return {"groups": groups, "summary": summary}


def checks(db: Session):
    return {"status": True, "data": run_checks(db)}


def summary(db: Session):
    with _summary_lock:
        cached = _summary_cache["value"] if time.monotonic() - _summary_cache["at"] < _SUMMARY_TTL else None
    if cached is None:
        run_checks(db)
        cached = _summary_cache["value"]
    return {"status": True, "data": cached}


def sizes(db: Session):
    deadline = time.monotonic() + 8
    folders = []
    for key, label, path in (("uploads", "Uploaded files", UPLOADS_DIR), ("logs", "Log files", LOGS_DIR),
                             ("backups", "Backups", runner.BACKUP_DIR)):
        size, complete = dir_size(path, deadline)
        folders.append({"key": key, "label": label, "path": f"storage/{path.name}", "bytes": size, "complete": complete})
    db_size = database_size(db)
    return {"status": True, "data": {"folders": folders, "database": {"label": "Database", "bytes": db_size}}}


def _explain(error: str, cfg: dict) -> str:
    low = error.lower()
    host, port = cfg.get("host"), cfg.get("port")
    if "authentication" in low or "535" in low or "username and password not accepted" in low:
        return "The server rejected the username or password. Check them (Gmail and Outlook need an app password)."
    if "getaddrinfo" in low or "name or service not known" in low or "nodename" in low:
        return f"The host \"{host}\" could not be found. Check the spelling."
    if "timed out" in low or "timeout" in low:
        return f"No answer from {host}:{port}. The port may be blocked by a firewall, or wrong for this encryption."
    if "refused" in low:
        return f"{host} refused the connection on port {port}. Check the port number."
    if "wrong version number" in low or "ssl" in low or "tls" in low:
        return f"The encryption doesn't match the port. Use TLS with port 587 or SSL with port 465 (now: {cfg.get('encryption')} on {port})."
    if "starttls" in low:
        return "The server doesn't offer TLS on this port. Try SSL on port 465 or no encryption."
    return f"Could not connect: {error[:200]}"


def clear_cache(request):
    sent = invalidate(wait=True)
    db = SessionLocal()
    try:
        log_activity(db, "cleared", request=request, subject_type="website_cache",
                     description="Cleared the website cache")
        db.commit()
    finally:
        db.close()
    if not revalidation_enabled():
        return {"status": True, "message": "Server caches cleared. Instant website refresh isn't set up "
                                            "(INTERNAL_API_KEY), so pages update when their cache expires."}
    if not sent:
        return {"status": False, "message": "Server caches cleared, but the website didn't respond. "
                                             "Check System health -> Website cache refresh."}
    return {"status": True, "message": "Website cache cleared. Visitors now see the latest content."}


def mail_check(db: Session):
    cfg = get_group(db, "mail", with_secrets=True, fresh=True)
    if not cfg.get("host"):
        raise HTTPException(status_code=422, detail="No SMTP server is set. Fill in Settings -> Email first.")
    started = time.monotonic()
    port = int(cfg.get("port") or 587)
    try:
        if cfg.get("encryption") == "ssl":
            server = smtplib.SMTP_SSL(cfg["host"], port, context=ssl.create_default_context(), timeout=15)
        else:
            server = smtplib.SMTP(cfg["host"], port, timeout=15)
            if cfg.get("encryption") == "tls":
                server.starttls(context=ssl.create_default_context())
        with server:
            server.ehlo_or_helo_if_needed()
            if cfg.get("username"):
                server.login(cfg["username"], cfg.get("password") or "")
            server.noop()
    except (smtplib.SMTPException, OSError, socket.error, ssl.SSLError) as exc:
        detail = re.sub(r"\s+", " ", str(exc) or exc.__class__.__name__).strip()
        raise HTTPException(status_code=422, detail={
            "message": _explain(detail, cfg), "errors": {},
            "data": {"ok": False, "detail": detail[:500], "seconds": round(time.monotonic() - started, 1)},
        })
    seconds = round(time.monotonic() - started, 1)
    message = f"Connected to {cfg['host']}:{port}" + (" and logged in" if cfg.get("username") else "") + ". The server is ready to send."
    if not cfg.get("enabled"):
        message += " Email sending is still turned off in Settings -> Email."
    return {"status": True, "message": message, "data": {"ok": True, "seconds": seconds}}
