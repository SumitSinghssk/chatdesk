from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.not_found.models import NotFoundLog
from app.modules.admin.not_found.schemas import NotFoundRedirectSchema
from app.modules.admin.redirects.models import Redirect
from app.modules.admin.redirects.service import validate_redirect
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import IdsSchema
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SUBJECT = "not_found_log"
TABS = ("open", "redirected", "ignored", "all")


def _serialize(item) -> dict:
    row, redirect = item
    active = bool(redirect and redirect.status == Status.ACTIVE.value)
    return {
        "id": row.id,
        "path": row.path,
        "hits": row.hits,
        "last_referrer": row.last_referrer,
        "last_user_agent": row.last_user_agent,
        "ignored": row.ignored,
        "first_seen_at": iso(row.first_seen_at),
        "last_seen_at": iso(row.last_seen_at),
        "has_redirect": active,
        "redirect": {
            "id": redirect.id,
            "target_url": redirect.target_url,
            "status_code": redirect.status_code,
            "status": redirect.status,
        } if redirect else None,
    }


def _base(db: Session, columns=None):
    q = db.query(*(columns or (NotFoundLog, Redirect)))
    return q.outerjoin(Redirect, Redirect.source_path == NotFoundLog.path)


def _tab_clause(tab: str):
    active = Redirect.status == Status.ACTIVE.value
    if tab == "open":
        return and_(NotFoundLog.ignored.is_(False), or_(Redirect.id.is_(None), Redirect.status != Status.ACTIVE.value))
    if tab == "redirected":
        return active
    if tab == "ignored":
        return NotFoundLog.ignored.is_(True)
    return None


def _counts(db: Session) -> dict:
    counts = {}
    for tab in TABS:
        q = _base(db, (func.count(NotFoundLog.id),))
        clause = _tab_clause(tab)
        if clause is not None:
            q = q.filter(clause)
        counts[tab] = q.scalar() or 0
    return counts


REDIRECTED = and_(Redirect.id.isnot(None), Redirect.status == Status.ACTIVE.value)

GRID_FIELDS = {
    "path": GridField(NotFoundLog.path, "text"),
    "hits": GridField(NotFoundLog.hits, "number"),
    "last_seen_at": GridField(NotFoundLog.last_seen_at, "date"),
    "first_seen_at": GridField(NotFoundLog.first_seen_at, "date"),
    "last_referrer": GridField(NotFoundLog.last_referrer, "text"),
    "last_user_agent": GridField(NotFoundLog.last_user_agent, "text", sortable=False),
    "ignored": GridField(NotFoundLog.ignored, "bool"),
    "redirected": GridField(REDIRECTED, "bool", sortable=False),
    "redirect_target": GridField(Redirect.target_url, "text"),
}
LEGACY_SORT = {"latest": None, "oldest": "first_seen_at"}


def list_logs(db: Session, page=None, per_page=None, search=None, tab="open", sort=None,
              filters: str | None = None, match: str | None = "and"):
    q = _base(db)
    clause = _tab_clause(tab or "open")
    if clause is not None:
        q = q.filter(clause)
    term = search_clause([NotFoundLog.path, NotFoundLog.last_referrer], search)
    if term is not None:
        q = q.filter(term)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    sort = LEGACY_SORT.get(sort, sort) if sort else None
    q = apply_sort(q, GRID_FIELDS, sort, [NotFoundLog.last_seen_at.desc(), NotFoundLog.id.desc()])
    result = list_response(q, _serialize, page, per_page, search)
    result["counts"] = _counts(db)
    return result


def stats(db: Session):
    current = now()
    day_ago = current - timedelta(hours=24)
    week_ago = current - timedelta(days=7)

    def count(*filters) -> int:
        return db.query(func.count(NotFoundLog.id)).filter(*filters).scalar() or 0

    counts = _counts(db)
    top = (
        _base(db, (NotFoundLog.id, NotFoundLog.path, NotFoundLog.hits))
        .filter(_tab_clause("open"))
        .order_by(NotFoundLog.hits.desc(), NotFoundLog.last_seen_at.desc())
        .first()
    )
    return {
        "status": True,
        "data": {
            **counts,
            "total_hits": int(db.query(func.coalesce(func.sum(NotFoundLog.hits), 0)).scalar() or 0),
            "last_24h": count(NotFoundLog.last_seen_at >= day_ago),
            "new_this_week": count(NotFoundLog.first_seen_at >= week_ago),
            "new_last_week": count(NotFoundLog.first_seen_at >= week_ago - timedelta(days=7),
                                   NotFoundLog.first_seen_at < week_ago),
            "top": {"id": top.id, "path": top.path, "hits": top.hits} if top else None,
        },
    }


def _get_or_404(db: Session, log_id: int) -> NotFoundLog:
    row = db.query(NotFoundLog).filter(NotFoundLog.id == log_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="404 entry not found")
    return row


def create_redirect(db: Session, payload: NotFoundRedirectSchema, request: Request):
    row = _get_or_404(db, payload.id)
    existing = db.query(Redirect).filter(Redirect.source_path == row.path).first()
    source, target = validate_redirect(db, row.path, payload.target_url,
                                       exclude_id=existing.id if existing else None)
    if existing:
        existing.source_path = source
        existing.target_url = target
        existing.status_code = payload.status_code
        existing.status = Status.ACTIVE.value
        redirect = existing
        action = "updated"
    else:
        redirect = Redirect(source_path=source, target_url=target, status_code=payload.status_code,
                            status=Status.ACTIVE.value, hits=0, note="Created from 404 log")
        db.add(redirect)
        action = "created"
    db.flush()
    log_activity(db, action, request=request, subject_type="redirect", subject_id=redirect.id,
                 subject_label=redirect.source_path, description="Redirect created from 404 log",
                 new_values={"source_path": source, "target_url": target, "status_code": payload.status_code})
    db.commit()
    return {
        "status": True,
        "message": f"Redirect created: {source} → {target}",
        "data": {"id": redirect.id, "source_path": redirect.source_path, "target_url": redirect.target_url,
                 "status_code": redirect.status_code, "status": redirect.status},
    }


def _paths(db: Session, ids: list[int]) -> list[str]:
    return [p for (p,) in db.query(NotFoundLog.path).filter(NotFoundLog.id.in_(ids)).order_by(NotFoundLog.path).all()]


def set_ignored(db: Session, payload: IdsSchema, ignored: bool, request: Request):
    paths = _paths(db, payload.ids)
    count = (
        db.query(NotFoundLog)
        .filter(NotFoundLog.id.in_(payload.ids))
        .update({NotFoundLog.ignored: ignored}, synchronize_session=False)
    )
    action = "ignored" if ignored else "unignored"
    log_activity(db, action, request=request, subject_type=SUBJECT,
                 description=f"{action.capitalize()} {count} 404 entries", new_values={"paths": paths})
    db.commit()
    return {"status": True, "message": f"{count} entries {action}"}


def delete_logs(db: Session, payload: IdsSchema, request: Request):
    paths = _paths(db, payload.ids)
    count = db.query(NotFoundLog).filter(NotFoundLog.id.in_(payload.ids)).delete(synchronize_session=False)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT,
                 description=f"Deleted {count} 404 entries", old_values={"paths": paths})
    db.commit()
    return {"status": True, "message": f"{count} entries deleted"}


def clear_logs(db: Session, request: Request):
    count = db.query(NotFoundLog).delete(synchronize_session=False)
    log_activity(db, "cleared", request=request, subject_type=SUBJECT, description=f"Cleared {count} 404 entries")
    db.commit()
    return {"status": True, "message": f"{count} entries cleared"}
