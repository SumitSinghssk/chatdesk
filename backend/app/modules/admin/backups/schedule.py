import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.modules.admin.backups.models import Backup
from app.modules.admin.settings.models import Setting
from app.shared.utils.datetime import DEFAULT_TIMEZONE, iso, now

KEY = "backup_settings"
HEARTBEAT_KEY = "scheduler_heartbeat"

DEFAULTS = {
    "enabled": False,
    "frequency": "daily",
    "time": "02:00",
    "weekday": 1,
    "monthday": 1,
    "include_database": True,
    "include_files": True,
    "keep": 7,
}
EDITABLE = tuple(DEFAULTS)

WEEKDAYS = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday"}


def _row(db: Session, key: str) -> Setting | None:
    return db.query(Setting).filter(Setting.key == key).first()


def _put(db: Session, key: str, value: dict) -> None:
    row = _row(db, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


def get_settings(db: Session) -> dict:
    row = _row(db, KEY)
    stored = row.value if row and isinstance(row.value, dict) else {}
    return {**DEFAULTS, **stored}


def save_settings(db: Session, data: dict) -> dict:
    value = {**get_settings(db), **data, "active_since": now().isoformat()}
    _put(db, KEY, value)
    return value


def heartbeat_value(db: Session) -> dict:
    row = _row(db, HEARTBEAT_KEY)
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def record_heartbeat(db: Session, **extra) -> None:
    value = heartbeat_value(db)
    value.update(extra)
    value["at"] = now().isoformat()
    _put(db, HEARTBEAT_KEY, value)


def last_heartbeat(db: Session) -> datetime | None:
    row = _row(db, HEARTBEAT_KEY)
    raw = row.value.get("at") if row and isinstance(row.value, dict) else None
    try:
        return datetime.fromisoformat(raw) if raw else None
    except ValueError:
        return None


def site_zone(db: Session) -> ZoneInfo:
    tz = None
    row = _row(db, "date_time")
    if row and isinstance(row.value, dict):
        tz = row.value.get("timezone")
    try:
        return ZoneInfo(tz or DEFAULT_TIMEZONE)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def _app_zone() -> ZoneInfo:
    return ZoneInfo("UTC")


def _to_local(value: datetime, zone: ZoneInfo) -> datetime:
    return value.replace(tzinfo=_app_zone()).astimezone(zone).replace(tzinfo=None)


def _to_app(value: datetime, zone: ZoneInfo) -> datetime:
    return value.replace(tzinfo=zone).astimezone(_app_zone()).replace(tzinfo=None)


def _hm(s: dict) -> tuple[int, int]:
    try:
        hour, minute = (int(p) for p in str(s.get("time", "02:00")).split(":", 1))
        return hour, minute
    except ValueError:
        return 2, 0


def _month_slot(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, min(max(1, day), 28), hour, minute)


def _prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def last_slot(db: Session, current: datetime | None = None, s: dict | None = None) -> datetime | None:
    s = s or get_settings(db)
    if not s.get("enabled"):
        return None
    zone = site_zone(db)
    local_now = _to_local(current or now(), zone)
    hour, minute = _hm(s)

    if s.get("frequency") == "weekly":
        monday = local_now.date() - timedelta(days=local_now.weekday())
        day = monday + timedelta(days=int(s.get("weekday", 1)) - 1)
        slot = datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)
        if slot > local_now:
            slot -= timedelta(days=7)
    elif s.get("frequency") == "monthly":
        monthday = int(s.get("monthday", 1))
        slot = _month_slot(local_now.year, local_now.month, monthday, hour, minute)
        if slot > local_now:
            y, m = _prev_month(local_now.year, local_now.month)
            slot = _month_slot(y, m, monthday, hour, minute)
    else:
        slot = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if slot > local_now:
            slot -= timedelta(days=1)
    return _to_app(slot, zone)


def is_due(db: Session, current: datetime | None = None) -> bool:
    s = get_settings(db)
    slot = last_slot(db, current, s)
    if slot is None:
        return False
    since = s.get("active_since")
    if since:
        try:
            if slot < datetime.fromisoformat(since):
                return False
        except ValueError:
            pass
    taken = db.query(Backup.id).filter(Backup.trigger == "scheduled", Backup.started_at >= slot).first()
    return taken is None


def next_run(db: Session, current: datetime | None = None) -> datetime | None:
    current = current or now()
    s = get_settings(db)
    slot = last_slot(db, current, s)
    if slot is None:
        return None
    if is_due(db, current):
        return current
    zone = site_zone(db)
    local = _to_local(slot, zone)
    if s.get("frequency") == "weekly":
        nxt = local + timedelta(days=7)
    elif s.get("frequency") == "monthly":
        y, m = _next_month(local.year, local.month)
        nxt = _month_slot(y, m, int(s.get("monthday", 1)), local.hour, local.minute)
    else:
        nxt = local + timedelta(days=1)
    return _to_app(nxt, zone)


def describe(db: Session, s: dict | None = None) -> str:
    s = s or get_settings(db)
    if not s.get("enabled"):
        return "Automatic backups are off"
    zone = f" ({str(site_zone(db).key).replace('_', ' ')} time)"
    if s.get("frequency") == "weekly":
        return f"Every {WEEKDAYS.get(int(s.get('weekday', 1)), 'Monday')} at {s.get('time')}{zone}"
    if s.get("frequency") == "monthly":
        return f"On day {s.get('monthday')} of every month at {s.get('time')}{zone}"
    return f"Every day at {s.get('time')}{zone}"


def scheduler_commands() -> dict:
    root = PROJECT_ROOT
    win_python = root / "venv" / "Scripts" / "python.exe"
    linux = f"* * * * * cd {root.as_posix()} && venv/bin/python scheduler.py >> /dev/null 2>&1"
    windows = (
        'schtasks /Create /F /SC MINUTE /MO 1 /TN "Starter Kit scheduler" '
        f'/TR "\\"{win_python}\\" \\"{root / "scheduler.py"}\\""'
    )
    return {
        "linux": linux,
        "windows": windows,
        "windows_note": "On Windows, create a Task Scheduler task that runs every minute "
                        "(the command above does it from an administrator prompt), with "
                        f"\"Start in\" set to {root}.",
        "is_windows": sys.platform.startswith("win"),
        "manual": "python scheduler.py",
    }


def payload(db: Session) -> dict:
    s = get_settings(db)
    beat = last_heartbeat(db)
    nxt = next_run(db)
    return {
        "settings": {k: s[k] for k in EDITABLE},
        "description": describe(db, s),
        "timezone": str(site_zone(db).key),
        "next_run_at": iso(nxt),
        "last_scheduler_run": iso(beat),
        "scheduler_running": bool(beat and beat > now() - timedelta(minutes=5)),
        "cron_command": scheduler_commands(),
    }
