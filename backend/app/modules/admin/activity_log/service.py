import logging
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.models import ActivityLog
from app.modules.admin.users.models import User
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.request_meta import client_ip, describe_agent, user_agent
from app.shared.utils.search import search_clause

logger = logging.getLogger(__name__)


def log_activity(
    db: Session,
    action: str,
    *,
    request: Request | None = None,
    user: User | None = None,
    subject_type: str | None = None,
    subject_id: int | None = None,
    subject_label: str | None = None,
    description: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    try:
        if user is None and request is not None:
            user = getattr(request.state, "user", None)
        ua = user_agent(request)
        row = ActivityLog(
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            action=action,
            subject_type=subject_type,
            subject_id=subject_id,
            subject_label=(subject_label or "")[:255] or None,
            description=description,
            old_values=old_values,
            new_values=new_values,
            ip_address=client_ip(request),
            user_agent=ua,
            **describe_agent(ua),
        )
        db.add(row)
        db.flush()
    except Exception:
        logger.exception("Failed to write activity log: action=%s", action)


def log_bulk(
    db: Session,
    action: str,
    rows: list,
    *,
    request: Request | None,
    subject_type: str,
    label,
    statuses: dict | None = None,
    snapshots: dict | None = None,
) -> None:
    for row in rows:
        if action == "delete":
            log_activity(db, "deleted", request=request, subject_type=subject_type, subject_id=row.id,
                         subject_label=label(row), description="Deleted in a bulk action",
                         old_values=(snapshots or {}).get(row.id))
            continue
        before = (statuses or {}).get(row.id)
        if before == row.status:
            continue
        log_activity(db, "status_changed", request=request, subject_type=subject_type, subject_id=row.id,
                     subject_label=label(row), description="Changed in a bulk action",
                     old_values={"status": before}, new_values={"status": row.status})


def diff(before: dict, after: dict) -> tuple[dict, dict]:
    old, new = {}, {}
    for key, value in after.items():
        if before.get(key) != value:
            old[key] = before.get(key)
            new[key] = value
    return old, new


def _serialize(row: ActivityLog) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "user": {"id": row.user.id, "name": row.user.name, "email": row.user.email} if row.user else None,
        "user_email": row.user_email,
        "action": row.action,
        "subject_type": row.subject_type,
        "subject_id": row.subject_id,
        "subject_label": row.subject_label,
        "description": row.description,
        "old_values": row.old_values,
        "new_values": row.new_values,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        "browser": row.browser,
        "platform": row.platform,
        "device": row.device,
        "created_at": iso(row.created_at),
    }


GRID_FIELDS = {
    "user": GridField(ActivityLog.user_id, "enum", cast=int),
    "user_email": GridField(ActivityLog.user_email, "text"),
    "action": GridField(ActivityLog.action, "enum"),
    "subject_type": GridField(ActivityLog.subject_type, "enum"),
    "subject_id": GridField(ActivityLog.subject_id, "number"),
    "subject_label": GridField(ActivityLog.subject_label, "text"),
    "description": GridField(ActivityLog.description, "text"),
    "ip_address": GridField(ActivityLog.ip_address, "text"),
    "browser": GridField(ActivityLog.browser, "text"),
    "platform": GridField(ActivityLog.platform, "text"),
    "device": GridField(ActivityLog.device, "enum"),
    "created_at": GridField(ActivityLog.created_at, "date"),
}


def list_logs(db: Session, page=None, per_page=None, search=None, action=None, user_id=None,
              subject_type=None, date_from=None, date_to=None,
              filters: str | None = None, match: str | None = "and", sort: str | None = None,
              subject_id: int | None = None):
    q = db.query(ActivityLog)
    clause = search_clause(
        [ActivityLog.user_email, ActivityLog.subject_label, ActivityLog.description, ActivityLog.ip_address],
        search,
    )
    if clause is not None:
        q = q.filter(clause)
    if action:
        q = q.filter(ActivityLog.action == action)
    if user_id:
        q = q.filter(ActivityLog.user_id == user_id)
    if subject_type:
        q = q.filter(ActivityLog.subject_type == subject_type)
    if subject_id:
        q = q.filter(ActivityLog.subject_id == subject_id)
    if date_from:
        q = q.filter(ActivityLog.created_at >= date_from)
    if date_to:
        q = q.filter(ActivityLog.created_at < date_to + timedelta(days=1))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [ActivityLog.id.desc()])
    return list_response(q, _serialize, page, per_page or 25, search)


def get_log(db: Session, log_id: int):
    row = db.query(ActivityLog).filter(ActivityLog.id == log_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Activity log not found")
    return {"status": True, "data": _serialize(row)}


def stats(db: Session):
    current = now()
    since = current - timedelta(days=30)
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(ActivityLog.id)).filter(*filters).scalar() or 0

    rows = (
        db.query(ActivityLog.action, func.count(ActivityLog.id))
        .filter(ActivityLog.created_at >= since)
        .group_by(ActivityLog.action)
        .all()
    )
    counts = {action: total for action, total in rows}
    subject_types = [t for (t,) in db.query(ActivityLog.subject_type).distinct().all() if t]
    users = (
        db.query(User.id, User.name)
        .join(ActivityLog, ActivityLog.user_id == User.id)
        .distinct()
        .order_by(User.name)
        .limit(200)
        .all()
    )
    return {
        "status": True,
        "data": {
            "total": db.query(func.count(ActivityLog.id)).scalar() or 0,
            "last_30_days": sum(counts.values()),
            "logins": counts.get("login", 0),
            "failed_logins": counts.get("login_failed", 0),
            "created": counts.get("created", 0),
            "updated": counts.get("updated", 0),
            "deleted": counts.get("deleted", 0),
            "actions": sorted(counts.keys()),
            "today": count(ActivityLog.created_at >= today_start),
            "this_week": count(ActivityLog.created_at >= week_start),
            "last_week": count(ActivityLog.created_at >= week_start - timedelta(days=7),
                               ActivityLog.created_at < week_start),
            "active_users": db.query(func.count(func.distinct(ActivityLog.user_id)))
            .filter(ActivityLog.created_at >= week_start, ActivityLog.user_id.isnot(None)).scalar() or 0,
            "active_users_30_days": db.query(func.count(func.distinct(ActivityLog.user_id)))
            .filter(ActivityLog.created_at >= since, ActivityLog.user_id.isnot(None)).scalar() or 0,
            "by_action": counts,
            "subject_types": sorted(subject_types),
            "users": [{"id": uid, "name": name} for uid, name in users],
        },
    }


def clear_logs(db: Session, request: Request):
    deleted = db.query(ActivityLog).delete()
    log_activity(db, "cleared", request=request, subject_type="activity_log",
                 description=f"Cleared {deleted} activity log entries")
    db.commit()
    return {"status": True, "message": f"{deleted} entries cleared"}
