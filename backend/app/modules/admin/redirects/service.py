from urllib.parse import urlparse

from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.redirects.models import Redirect
from app.modules.admin.redirects.schemas import RedirectCreateSchema, RedirectUpdateSchema
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_path

SUBJECT = "redirect"
RESERVED_PREFIXES = ("/admin", "/api")


def _serialize(row: Redirect) -> dict:
    return {
        "id": row.id,
        "source_path": row.source_path,
        "target_url": row.target_url,
        "status_code": row.status_code,
        "status": row.status,
        "hits": row.hits or 0,
        "last_hit_at": iso(row.last_hit_at),
        "note": row.note,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: Redirect) -> dict:
    return {"source_path": row.source_path, "target_url": row.target_url, "status_code": row.status_code,
            "status": row.status, "note": row.note}


def _get_or_404(db: Session, redirect_id: int) -> Redirect:
    row = db.query(Redirect).filter(Redirect.id == redirect_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Redirect not found")
    return row


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def clean_source(value: str | None, field: str = "source_path") -> str:
    raw = (value or "").strip()
    if raw.startswith(("http://", "https://")):
        raise _field_error(field, "Source must be a path on this site, e.g. /old-page")
    path = normalize_path(raw.split("#", 1)[0].split("?", 1)[0])
    if path == "/":
        raise _field_error(field, "The home page can't be redirected")
    lowered = path.lower()
    if any(lowered == p or lowered.startswith(p + "/") for p in RESERVED_PREFIXES):
        raise _field_error(field, "Paths under /admin or /api can't be redirected")
    return path


def clean_target(value: str | None) -> str:
    raw = (value or "").strip()
    if raw.startswith("/") and not raw.startswith("//"):
        return normalize_path(raw)
    parsed = urlparse(raw)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return raw
    raise _field_error("target_url", "Target must be a path starting with / or a full http(s) URL")


def validate_redirect(db: Session, source: str, target: str, exclude_id: int | None = None) -> tuple[str, str]:
    source = clean_source(source)
    target = clean_target(target)
    if target == source:
        raise _field_error("target_url", "Target must be different from the source")

    taken = db.query(Redirect.id).filter(Redirect.source_path == source)
    if exclude_id is not None:
        taken = taken.filter(Redirect.id != exclude_id)
    if db.query(taken.exists()).scalar():
        raise _field_error("source_path", "A redirect for this path already exists")

    if target.startswith("/"):
        reverse = db.query(Redirect).filter(Redirect.source_path == target)
        if exclude_id is not None:
            reverse = reverse.filter(Redirect.id != exclude_id)
        reverse = reverse.first()
        if reverse and clean_target_quiet(reverse.target_url) == source:
            raise _field_error("target_url", f"This would create a redirect loop with {reverse.source_path}")
    return source, target


def clean_target_quiet(value: str | None) -> str | None:
    try:
        return clean_target(value)
    except HTTPException:
        return value


def _prepare(db: Session, payload, exclude_id: int | None = None) -> dict:
    data = payload.model_dump()
    data["source_path"], data["target_url"] = validate_redirect(db, payload.source_path, payload.target_url,
                                                                exclude_id)
    data["status"] = payload.status.value
    return data


GRID_FIELDS = {
    "source_path": GridField(Redirect.source_path, "text"),
    "target_url": GridField(Redirect.target_url, "text"),
    "status_code": GridField(Redirect.status_code, "enum", cast=int),
    "status": GridField(Redirect.status, "enum"),
    "hits": GridField(Redirect.hits, "number"),
    "last_hit_at": GridField(Redirect.last_hit_at, "date"),
    "note": GridField(Redirect.note, "text"),
    "created_at": GridField(Redirect.created_at, "date"),
    "updated_at": GridField(Redirect.updated_at, "date"),
}


def list_redirects(db: Session, page=None, per_page=None, search=None, status=None, status_code=None,
                   filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(Redirect)
    clause = search_clause([Redirect.source_path, Redirect.target_url, Redirect.note], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Redirect.status == status)
    if status_code:
        q = q.filter(Redirect.status_code == status_code)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Redirect.id.desc()])
    return list_response(q, _serialize, page, per_page, search)


def stats(db: Session):
    since = now() - timedelta(days=30)

    def count(*filters) -> int:
        return db.query(func.count(Redirect.id)).filter(*filters).scalar() or 0

    by_code = dict(db.query(Redirect.status_code, func.count(Redirect.id)).group_by(Redirect.status_code).all())
    active = count(Redirect.status == Status.ACTIVE.value)
    total = sum(by_code.values())
    return {
        "status": True,
        "data": {
            "total": total,
            "active": active,
            "inactive": total - active,
            "total_hits": int(db.query(func.coalesce(func.sum(Redirect.hits), 0)).scalar() or 0),
            "hit_last_30_days": count(Redirect.last_hit_at >= since),
            "unused": count(func.coalesce(Redirect.hits, 0) == 0),
            "by_code": {str(code): by_code.get(code, 0) for code in (301, 302, 307, 308)},
        },
    }


def get_redirect(db: Session, redirect_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, redirect_id))}


def create_redirect(db: Session, payload: RedirectCreateSchema, request: Request):
    row = Redirect(**_prepare(db, payload), hits=0)
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.source_path, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Redirect created", "data": _serialize(_get_or_404(db, row.id))}


def update_redirect(db: Session, redirect_id: int, payload: RedirectUpdateSchema, request: Request):
    row = _get_or_404(db, redirect_id)
    before = _snapshot(row)
    for key, value in _prepare(db, payload, exclude_id=row.id).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.source_path, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Redirect updated", "data": _serialize(_get_or_404(db, row.id))}


def toggle_status(db: Session, redirect_id: int, request: Request):
    row = _get_or_404(db, redirect_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.source_path, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Redirect {row.status}", "data": _serialize(row)}


def delete_redirect(db: Session, redirect_id: int, request: Request):
    row = _get_or_404(db, redirect_id)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.source_path, old_values=_snapshot(row))
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Redirect deleted"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Redirect).filter(Redirect.id.in_(payload.ids)).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    ids = [r.id for r in rows]
    for row in rows:
        if payload.action == "delete":
            db.delete(row)
        else:
            row.status = Status.ACTIVE.value if payload.action == "activate" else Status.INACTIVE.value
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: r.source_path,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    verb = "deleted" if payload.action == "delete" else "updated"
    return {"status": True, "message": f"{len(ids)} redirects {verb}"}
