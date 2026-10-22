from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.testimonials.schemas import TestimonialCreateSchema, TestimonialUpdateSchema
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema, ReorderSchema
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SUBJECT = "testimonial"


def _serialize(row: Testimonial) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "designation": row.designation,
        "company": row.company,
        "quote": row.quote,
        "photo": row.photo,
        "rating": row.rating,
        "is_featured": row.is_featured,
        "sort_order": row.sort_order,
        "status": row.status,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: Testimonial) -> dict:
    return {"name": row.name, "designation": row.designation, "company": row.company, "quote": row.quote,
            "photo": row.photo, "rating": row.rating, "is_featured": row.is_featured,
            "sort_order": row.sort_order, "status": row.status}


def _get_or_404(db: Session, testimonial_id: int) -> Testimonial:
    row = db.query(Testimonial).filter(Testimonial.id == testimonial_id, Testimonial.not_deleted()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return row


def _prepare(payload) -> dict:
    data = payload.model_dump()
    data["status"] = payload.status.value
    return data


GRID_FIELDS = {
    "name": GridField(Testimonial.name, "text"),
    "designation": GridField(Testimonial.designation, "text"),
    "company": GridField(Testimonial.company, "text"),
    "quote": GridField(Testimonial.quote, "text", sortable=False),
    "rating": GridField(Testimonial.rating, "number"),
    "is_featured": GridField(Testimonial.is_featured, "bool"),
    "status": GridField(Testimonial.status, "enum"),
    "photo": GridField(Testimonial.photo.isnot(None), "bool", sortable=False),
    "sort_order": GridField(Testimonial.sort_order, "number"),
    "created_at": GridField(Testimonial.created_at, "date"),
    "updated_at": GridField(Testimonial.updated_at, "date"),
}


def list_testimonials(db: Session, page=None, per_page=None, search=None, status=None, rating=None, featured=None,
                      filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(Testimonial).filter(Testimonial.not_deleted())
    clause = search_clause([Testimonial.name, Testimonial.designation, Testimonial.company, Testimonial.quote], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Testimonial.status == status)
    if rating:
        q = q.filter(Testimonial.rating == rating)
    if featured is not None:
        q = q.filter(Testimonial.is_featured.is_(featured))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Testimonial.sort_order.asc(), Testimonial.id.desc()])
    return list_response(q, _serialize, page, per_page, search)


def stats(db: Session):
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(Testimonial.id)).filter(Testimonial.not_deleted(), *filters).scalar() or 0

    by_rating = dict(
        db.query(Testimonial.rating, func.count(Testimonial.id))
        .filter(Testimonial.not_deleted(), Testimonial.rating.isnot(None))
        .group_by(Testimonial.rating)
        .all()
    )
    average = (
        db.query(func.avg(Testimonial.rating))
        .filter(Testimonial.not_deleted(), Testimonial.rating.isnot(None))
        .scalar()
    )
    return {
        "status": True,
        "data": {
            "total": count(),
            "active": count(Testimonial.status == Status.ACTIVE.value),
            "inactive": count(Testimonial.status == Status.INACTIVE.value),
            "featured": count(Testimonial.is_featured.is_(True)),
            "featured_live": count(Testimonial.is_featured.is_(True), Testimonial.status == Status.ACTIVE.value),
            "rated": sum(by_rating.values()),
            "average_rating": round(float(average), 2) if average is not None else None,
            "by_rating": {str(n): by_rating.get(n, 0) for n in range(5, 0, -1)},
            "this_week": count(Testimonial.created_at >= week_start),
            "last_week": count(Testimonial.created_at >= week_start - timedelta(days=7),
                               Testimonial.created_at < week_start),
        },
    }


def get_testimonial(db: Session, testimonial_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, testimonial_id))}


def create_testimonial(db: Session, payload: TestimonialCreateSchema, request: Request):
    row = Testimonial(**_prepare(payload))
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Testimonial created", "data": _serialize(row)}


def update_testimonial(db: Session, testimonial_id: int, payload: TestimonialUpdateSchema, request: Request):
    row = _get_or_404(db, testimonial_id)
    before = _snapshot(row)
    for key, value in _prepare(payload).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Testimonial updated", "data": _serialize(row)}


def toggle_status(db: Session, testimonial_id: int, request: Request):
    row = _get_or_404(db, testimonial_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Testimonial {row.status}", "data": _serialize(row)}


def delete_testimonial(db: Session, testimonial_id: int, request: Request):
    row = _get_or_404(db, testimonial_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Testimonial moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Testimonial).filter(Testimonial.id.in_(payload.ids), Testimonial.not_deleted()).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    for row in rows:
        if payload.action == "delete":
            row.deleted_at = now()
        else:
            row.status = Status.ACTIVE.value if payload.action == "activate" else Status.INACTIVE.value
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: r.name,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    return {"status": True, "message": f"{len(rows)} testimonials updated"}


def reorder(db: Session, payload: ReorderSchema, request: Request):
    ids = list(dict.fromkeys(payload.ids))
    rows = {r.id: r for r in db.query(Testimonial).filter(Testimonial.id.in_(ids), Testimonial.not_deleted()).all()}
    for index, testimonial_id in enumerate(ids):
        if testimonial_id in rows:
            rows[testimonial_id].sort_order = index
    log_activity(db, "reordered", request=request, subject_type=SUBJECT,
                 description=f"Reordered {len(rows)} testimonials", new_values={"ids": ids})
    db.commit()
    return {"status": True, "message": "Order saved"}
