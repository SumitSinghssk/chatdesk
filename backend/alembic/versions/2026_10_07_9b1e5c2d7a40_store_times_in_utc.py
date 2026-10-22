import json
import os
from datetime import datetime, timezone
from typing import Sequence, Union
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa


revision: str = '9b1e5c2d7a40'
down_revision: Union[str, Sequence[str], None] = '184e40ed710e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_ZONE = os.getenv("APP_TIMEZONE") or "Asia/Kolkata"
JSON_TIMES = {
    "backup_settings": ("active_since",),
    "scheduler_heartbeat": ("at",),
}


def _columns(bind) -> list[tuple[str, str]]:
    rows = bind.execute(sa.text(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'"
    )).fetchall()
    return [(r[0], r[1]) for r in rows]


def _shift_json(bind, source: ZoneInfo, target: ZoneInfo) -> None:
    def convert(raw, aware=False):
        if not isinstance(raw, str) or not raw:
            return raw
        try:
            value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return raw
        if value.tzinfo is None:
            value = value.replace(tzinfo=source)
        shifted = value.astimezone(target)
        if aware:
            return shifted.isoformat().replace("+00:00", "Z")
        return shifted.replace(tzinfo=None).isoformat()

    for key, fields in {**JSON_TIMES, "maintenance": ("ends_at",)}.items():
        row = bind.execute(sa.text("SELECT value FROM settings WHERE key = :key"), {"key": key}).fetchone()
        if not row or not row[0]:
            continue
        value = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        for field in fields:
            value[field] = convert(value.get(field), aware=key == "maintenance")
        if key == "scheduler_heartbeat" and isinstance(value.get("tasks"), dict):
            value["tasks"] = {task: convert(at) for task, at in value["tasks"].items()}
        bind.execute(sa.text("UPDATE settings SET value = CAST(:value AS JSON) WHERE key = :key"),
                     {"key": key, "value": json.dumps(value)})


def _shift(source: str, target: str) -> None:
    bind = op.get_bind()
    for table, column in _columns(bind):
        bind.execute(sa.text(
            f'UPDATE "{table}" SET "{column}" = ("{column}" AT TIME ZONE :source) AT TIME ZONE :target '
            f'WHERE "{column}" IS NOT NULL'
        ), {"source": source, "target": target})
    _shift_json(bind, ZoneInfo(source), ZoneInfo(target) if target != "UTC" else timezone.utc)


def upgrade() -> None:
    if OLD_ZONE != "UTC":
        _shift(OLD_ZONE, "UTC")


def downgrade() -> None:
    if OLD_ZONE != "UTC":
        _shift("UTC", OLD_ZONE)
