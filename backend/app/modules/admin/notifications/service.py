import logging
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.notifications.models import Notification
from app.modules.admin.permissions.models import Permission
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role
from app.modules.admin.users.models import User
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.search import search_clause
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort

logger = logging.getLogger(__name__)


def notify(db: Session, user_ids: list[int], *, type: str, title: str,
           message: str | None = None, url: str | None = None, data: dict | None = None) -> None:
    try:
        for uid in set(user_ids):
            db.add(Notification(user_id=uid, type=type, title=title, message=message, url=url, data=data))
        db.flush()
    except Exception:
        logger.exception("Failed to create notification type=%s", type)


def notify_admins(db: Session, *, permission: str | None = None, exclude_user_id: int | None = None, **kwargs) -> None:
    q = db.query(User.id).outerjoin(Role, User.role_id == Role.id).filter(
        User.status == Status.ACTIVE.value, User.not_deleted()
    )
    users = {uid for (uid,) in q.filter(Role.name == SUPER_ADMIN_ROLE).all()}
    if permission:
        via_role = (
            q.join(Role.permissions).filter(Permission.name == permission).all()
        )
        via_direct = (
            db.query(User.id).join(User.direct_permissions)
            .filter(Permission.name == permission, User.status == Status.ACTIVE.value, User.not_deleted())
            .all()
        )
        users.update(uid for (uid,) in via_role)
        users.update(uid for (uid,) in via_direct)
    users.discard(exclude_user_id)
    notify(db, list(users), **kwargs)


def _serialize(row: Notification) -> dict:
    return {
        "id": row.id,
        "type": row.type,
        "title": row.title,
        "message": row.message,
        "url": row.url,
        "data": row.data,
        "read_at": iso(row.read_at),
        "created_at": iso(row.created_at),
    }


def _unread_count(db: Session, user_id: int) -> int:
    return db.query(func.count(Notification.id)).filter(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    ).scalar() or 0


GRID_FIELDS = {
    "title": GridField(Notification.title, "text"),
    "message": GridField(Notification.message, "text", sortable=False),
    "type": GridField(Notification.type, "enum"),
    "created_at": GridField(Notification.created_at, "date"),
    "read_at": GridField(Notification.read_at, "date"),
    "read": GridField(Notification.read_at.isnot(None), "bool", sortable=False),
}


def list_notifications(db: Session, user_id: int, page=None, per_page=None, unread: bool | None = None,
                       search: str | None = None, filters: str | None = None, match: str | None = "and",
                       sort: str | None = None):
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if unread:
        q = q.filter(Notification.read_at.is_(None))
    clause = search_clause([Notification.title, Notification.message], search)
    if clause is not None:
        q = q.filter(clause)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Notification.id.desc()])
    result = list_response(q, _serialize, page or 1, per_page or 15)
    result["unread_count"] = _unread_count(db, user_id)
    return result


def stats(db: Session, user_id: int):
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)
    mine = Notification.user_id == user_id

    def count(*filters) -> int:
        return db.query(func.count(Notification.id)).filter(mine, *filters).scalar() or 0

    rows = (
        db.query(Notification.type, func.count(Notification.id),
                 func.count(Notification.id).filter(Notification.read_at.is_(None)))
        .filter(mine).group_by(Notification.type).order_by(func.count(Notification.id).desc()).all()
    )
    return {
        "status": True,
        "data": {
            "total": sum(n for _, n, _ in rows),
            "unread": count(Notification.read_at.is_(None)),
            "today": count(Notification.created_at >= today_start),
            "unread_today": count(Notification.created_at >= today_start, Notification.read_at.is_(None)),
            "this_week": count(Notification.created_at >= week_start),
            "last_week": count(Notification.created_at >= week_start - timedelta(days=7),
                               Notification.created_at < week_start),
            "by_type": [{"type": t, "count": n, "unread": u} for t, n, u in rows],
        },
    }


def latest(db: Session, user_id: int, limit: int = 10):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.id.desc())
        .limit(limit)
        .all()
    )
    return {"status": True, "data": [_serialize(r) for r in rows], "unread_count": _unread_count(db, user_id)}


def mark_read(db: Session, user_id: int, notification_id: int):
    row = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == user_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.read_at is None:
        row.read_at = now()
        db.commit()
    return {"status": True, "message": "Marked as read", "data": _serialize(row)}


def mark_unread(db: Session, user_id: int, notification_id: int):
    row = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == user_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.read_at is not None:
        row.read_at = None
        db.commit()
    return {"status": True, "message": "Marked as unread", "data": _serialize(row)}


def mark_all_read(db: Session, user_id: int):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .update({Notification.read_at: now()}, synchronize_session=False)
    )
    db.commit()
    return {"status": True, "message": f"{count} notifications marked as read"}


def bulk(db: Session, user_id: int, ids: list[int], action: str):
    q = db.query(Notification).filter(Notification.user_id == user_id, Notification.id.in_(ids))
    if action == "read":
        count = q.filter(Notification.read_at.is_(None)).update(
            {Notification.read_at: now()}, synchronize_session=False)
        message = f"{count} notification(s) marked as read"
    elif action == "unread":
        count = q.filter(Notification.read_at.isnot(None)).update(
            {Notification.read_at: None}, synchronize_session=False)
        message = f"{count} notification(s) marked as unread"
    else:
        count = q.delete(synchronize_session=False)
        message = f"{count} notification(s) deleted"
    db.commit()
    return {"status": True, "message": message}


def delete_notification(db: Session, user_id: int, notification_id: int):
    deleted = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == user_id
    ).delete()
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.commit()
    return {"status": True, "message": "Notification deleted"}
