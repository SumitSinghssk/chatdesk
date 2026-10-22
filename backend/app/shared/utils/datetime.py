from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

UTC = timezone.utc
DEFAULT_TIMEZONE = "Asia/Kolkata"


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat().replace("+00:00", "Z")
    return value.isoformat()


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def _load_site_timezone() -> str:
    from app.core.database import SessionLocal
    from app.modules.admin.settings.models import Setting

    try:
        with SessionLocal() as db:
            row = db.query(Setting).filter(Setting.key == "date_time").first()
            value = row.value if row and isinstance(row.value, dict) else {}
            return value.get("timezone") or DEFAULT_TIMEZONE
    except Exception:
        return DEFAULT_TIMEZONE


_zone_cache = None


def site_zone() -> ZoneInfo:
    from app.core.cache import local_cache

    global _zone_cache
    if _zone_cache is None:
        _zone_cache = local_cache("settings", ttl=60)
    return _zone(_zone_cache.get_or_set("timezone", _load_site_timezone))


def to_utc(value: datetime | None, zone: ZoneInfo | None = None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=zone or site_zone())
    return value.astimezone(UTC).replace(tzinfo=None)


def to_site(value: datetime | None, zone: ZoneInfo | None = None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC).astimezone(zone or site_zone()).replace(tzinfo=None)


def site_now() -> datetime:
    return to_site(now())


def day_start(day: date, zone: ZoneInfo | None = None) -> datetime:
    return to_utc(datetime.combine(day, datetime.min.time()), zone)


def today_start() -> datetime:
    return day_start(site_now().date())


def days_ago_start(days: int) -> datetime:
    return day_start(site_now().date() - timedelta(days=days))
