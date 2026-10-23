import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402,F401
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.logging_config import configure_logging  # noqa: E402
from app.core.monitoring import capture_exception, init_sentry  # noqa: E402
from app.shared.utils.datetime import now  # noqa: E402

TASKS = ("publish", "campaigns", "chatbots", "backup", "trash", "not_found", "security", "customers")
HOUSEKEEPING = ("trash", "not_found", "security", "customers")
HOUSEKEEPING_EVERY = timedelta(hours=1)
TRASH_DAYS = 30
NOT_FOUND_DAYS = 90
SMS_LOG_DAYS = 90


def say(task: str, message: str) -> None:
    line = f"[{now():%Y-%m-%d %H:%M:%S}] {task:<9} {message}"
    print(line.encode("ascii", "replace").decode("ascii"), flush=True)


def task_backup(db, force: bool) -> str:
    from app.modules.admin.activity_log.service import log_activity
    from app.modules.admin.backups import runner, schedule
    from app.modules.admin.backups.models import Backup

    lock = engine.connect()
    if not lock.execute(text("select pg_try_advisory_lock(:k)"), {"k": runner.BACKUP_LOCK}).scalar():
        lock.close()
        return "skipped: another scheduler process is busy with a backup"
    try:
        running = db.query(Backup).filter(Backup.status == runner.RUNNING).order_by(Backup.id.desc()).first()
        if running and not runner.is_stalled(running):
            return f"skipped: {running.name} is still running"
        if not force and not schedule.is_due(db):
            nxt = schedule.next_run(db)
            return f"not due (next: {nxt:%Y-%m-%d %H:%M})" if nxt else "automatic backups are off"

        s = schedule.get_settings(db)
        backup = runner.start(db, "scheduled", bool(s["include_database"]), bool(s["include_files"]))
        log_activity(db, "created", subject_type="backup", subject_id=backup.id, subject_label=backup.name,
                     description="Scheduled backup started" + (" (forced)" if force else ""))
        db.commit()
        backup_id, name = backup.id, backup.name
        status = runner.run(backup_id)
        db.expire_all()
        done = db.get(Backup, backup_id)
        if status == runner.COMPLETED:
            return f"{name} completed ({done.size} bytes)"
        return f"{name} FAILED: {(done.error or '')[:200]}"
    finally:
        lock.execute(text("select pg_advisory_unlock(:k)"), {"k": runner.BACKUP_LOCK})
        lock.close()


def task_publish(db) -> str:
    from app.core.cache import invalidate
    from app.modules.admin.blogs.models import Blog
    from app.modules.admin.pages.models import Page

    current = now()
    window_start = current - timedelta(minutes=2)
    went_live = 0
    for model in (Blog, Page):
        went_live += (
            db.query(model)
            .filter(model.not_deleted(), model.status == "published",
                    model.published_at > window_start, model.published_at <= current)
            .count()
        )
    if not went_live:
        return "nothing scheduled went live"
    invalidate("blogs", "pages", "sitemap", wait=True)
    return f"{went_live} scheduled item(s) went live; website cache refreshed"


def task_campaigns(db) -> str:
    from app.modules.customer.campaigns import runner

    done = runner.run_due()
    return ", ".join(f"campaign {i}: {status}" for i, status in done) if done else "no campaigns due"


def task_chatbots(db) -> str:
    from app.modules.customer.chatbots import engine

    touched = engine.run_due(db)
    return f"{touched} chatbot chat(s) moved on" if touched else "no chatbot delays or timeouts due"


def task_trash(db) -> str:
    from app.modules.admin.trash import service as trash

    cutoff = now() - timedelta(days=TRASH_DAYS)
    counts = []
    for key, entry in trash.REGISTRY.items():
        model = entry.model
        rows = db.query(model).filter(model.deleted_at.is_not(None), model.deleted_at < cutoff).all()
        if rows:
            counts.append(f"{trash._purge(db, key, rows, None)} {key}")
    return f"purged {', '.join(counts)}" if counts else f"nothing older than {TRASH_DAYS} days"


def task_not_found(db) -> str:
    from app.modules.admin.not_found.models import NotFoundLog

    cutoff = now() - timedelta(days=NOT_FOUND_DAYS)
    count = db.query(NotFoundLog).filter(NotFoundLog.last_seen_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return f"removed {count} entr{'y' if count == 1 else 'ies'} not seen for {NOT_FOUND_DAYS} days"


def task_security(db) -> str:
    from app.core.rate_limiter import purge_expired
    from app.modules.admin.security.tasks import purge

    result = purge(db)
    db.commit()
    windows = purge_expired()
    if windows:
        result = f"{result + '; ' if result else ''}removed {windows} old rate-limit window{'s' if windows != 1 else ''}"
    return result or "nothing to do"


def task_customers(db) -> str:
    from app.modules.admin.sms.models import SmsLog
    from app.modules.customer.account.models import CustomerOtp, CustomerSession

    current = now()
    otps = db.query(CustomerOtp).filter(CustomerOtp.expires_at < current - timedelta(days=1))         .delete(synchronize_session=False)
    sessions = db.query(CustomerSession).filter(
        (CustomerSession.expires_at < current) | (CustomerSession.revoked_at < current - timedelta(days=30))
    ).delete(synchronize_session=False)
    logs = db.query(SmsLog).filter(SmsLog.created_at < current - timedelta(days=SMS_LOG_DAYS))         .delete(synchronize_session=False)
    db.commit()
    return f"removed {otps} old codes, {sessions} ended sessions, {logs} SMS logs"


def _due(last_runs: dict, task: str) -> bool:
    try:
        return datetime.fromisoformat(last_runs[task]) <= now() - HOUSEKEEPING_EVERY
    except (KeyError, TypeError, ValueError):
        return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the starter kit's scheduled tasks (call every minute).")
    parser.add_argument("--task", choices=(*TASKS, "all"), default=None,
                        help="run one task now (default: all, housekeeping at most hourly)")
    parser.add_argument("--force-backup", action="store_true", help="make a scheduled backup even if none is due")
    args = parser.parse_args(argv)

    configure_logging()
    init_sentry("scheduler")
    from app.modules.admin.backups import schedule

    explicit = args.task is not None
    selected = TASKS if args.task in (None, "all") else (args.task,)
    if args.force_backup and "backup" not in selected:
        selected = ("backup", *selected)

    db = SessionLocal()
    failures = 0
    try:
        schedule.record_heartbeat(db)
        db.commit()
        last_runs = dict(schedule.heartbeat_value(db).get("tasks") or {})

        for task in selected:
            if task in HOUSEKEEPING and not explicit and not _due(last_runs, task):
                continue
            try:
                if task == "backup":
                    message = task_backup(db, args.force_backup)
                elif task == "publish":
                    message = task_publish(db)
                elif task == "campaigns":
                    message = task_campaigns(db)
                elif task == "chatbots":
                    message = task_chatbots(db)
                else:
                    message = {"trash": task_trash, "not_found": task_not_found, "security": task_security,
                               "customers": task_customers}[task](db)
                if task in HOUSEKEEPING:
                    last_runs[task] = now().isoformat()
                say(task, message)
                if "FAILED" in message:
                    failures += 1
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                failures += 1
                capture_exception(exc)
                say(task, f"error: {exc.__class__.__name__}: {str(exc)[:200]}")

        schedule.record_heartbeat(db, tasks=last_runs)
        db.commit()
    finally:
        db.close()
    from app.core.cache import flush_pending

    flush_pending()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
