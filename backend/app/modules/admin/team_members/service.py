from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.team_members.models import TeamMember
from app.modules.admin.team_members.schemas import TeamMemberCreateSchema, TeamMemberUpdateSchema
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema, ReorderSchema
from app.shared.utils.datetime import days_ago_start, iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SUBJECT = "team_member"


def _serialize(row: TeamMember) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "designation": row.designation,
        "department": row.department,
        "bio": row.bio,
        "photo": row.photo,
        "email": row.email,
        "phone": row.phone,
        "social_links": row.social_links or [],
        "is_featured": row.is_featured,
        "sort_order": row.sort_order,
        "status": row.status,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: TeamMember) -> dict:
    return {"name": row.name, "designation": row.designation, "department": row.department, "bio": row.bio,
            "photo": row.photo, "email": row.email, "phone": row.phone, "social_links": row.social_links or [],
            "is_featured": row.is_featured, "sort_order": row.sort_order, "status": row.status}


def _get_or_404(db: Session, member_id: int) -> TeamMember:
    row = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.not_deleted()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Team member not found")
    return row


def _prepare(payload) -> dict:
    data = payload.model_dump()
    data["status"] = payload.status.value
    data["email"] = str(payload.email).lower() if payload.email else None
    return data


GRID_FIELDS = {
    "name": GridField(TeamMember.name, "text"),
    "designation": GridField(TeamMember.designation, "text"),
    "department": GridField(TeamMember.department, "enum"),
    "bio": GridField(TeamMember.bio, "text", sortable=False),
    "email": GridField(TeamMember.email, "text"),
    "phone": GridField(TeamMember.phone, "text"),
    "is_featured": GridField(TeamMember.is_featured, "bool"),
    "status": GridField(TeamMember.status, "enum"),
    "photo": GridField(TeamMember.photo.isnot(None), "bool", sortable=False),
    "sort_order": GridField(TeamMember.sort_order, "number"),
    "created_at": GridField(TeamMember.created_at, "date"),
    "updated_at": GridField(TeamMember.updated_at, "date"),
}


def list_members(db: Session, page=None, per_page=None, search=None, status=None, department=None,
                 filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(TeamMember).filter(TeamMember.not_deleted())
    clause = search_clause(
        [TeamMember.name, TeamMember.designation, TeamMember.department, TeamMember.email, TeamMember.bio], search
    )
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(TeamMember.status == status)
    if department:
        q = q.filter(TeamMember.department == department)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [TeamMember.sort_order.asc(), TeamMember.id.asc()])
    return list_response(q, _serialize, page, per_page, search)


def stats(db: Session):
    week_start = days_ago_start(6)

    def count(*filters) -> int:
        return db.query(func.count(TeamMember.id)).filter(TeamMember.not_deleted(), *filters).scalar() or 0

    departments = [
        d for (d,) in db.query(TeamMember.department)
        .filter(TeamMember.not_deleted(), TeamMember.department.isnot(None))
        .distinct()
        .order_by(TeamMember.department)
        .all()
    ]
    return {
        "status": True,
        "data": {
            "total": count(),
            "active": count(TeamMember.status == Status.ACTIVE.value),
            "inactive": count(TeamMember.status == Status.INACTIVE.value),
            "featured": count(TeamMember.is_featured.is_(True)),
            "without_photo": count(TeamMember.photo.is_(None)),
            "departments": departments,
            "this_week": count(TeamMember.created_at >= week_start),
            "last_week": count(TeamMember.created_at >= week_start - timedelta(days=7),
                               TeamMember.created_at < week_start),
        },
    }


def get_member(db: Session, member_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, member_id))}


def create_member(db: Session, payload: TeamMemberCreateSchema, request: Request):
    data = _prepare(payload)
    if not payload.model_fields_set & {"sort_order"}:
        data["sort_order"] = (db.query(func.max(TeamMember.sort_order)).filter(TeamMember.not_deleted()).scalar()
                              or 0) + 1
    row = TeamMember(**data)
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Team member added", "data": _serialize(row)}


def update_member(db: Session, member_id: int, payload: TeamMemberUpdateSchema, request: Request):
    row = _get_or_404(db, member_id)
    before = _snapshot(row)
    for key, value in _prepare(payload).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Team member updated", "data": _serialize(row)}


def toggle_status(db: Session, member_id: int, request: Request):
    row = _get_or_404(db, member_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Team member {row.status}", "data": _serialize(row)}


def delete_member(db: Session, member_id: int, request: Request):
    row = _get_or_404(db, member_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Team member moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(TeamMember).filter(TeamMember.id.in_(payload.ids), TeamMember.not_deleted()).all()
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
    return {"status": True, "message": f"{len(rows)} team members updated"}


def reorder(db: Session, payload: ReorderSchema, request: Request):
    ids = list(dict.fromkeys(payload.ids))
    rows = {r.id: r for r in db.query(TeamMember).filter(TeamMember.id.in_(ids), TeamMember.not_deleted()).all()}
    for index, member_id in enumerate(ids):
        if member_id in rows:
            rows[member_id].sort_order = index
    log_activity(db, "reordered", request=request, subject_type=SUBJECT,
                 description=f"Reordered {len(rows)} team members", new_values={"ids": ids})
    db.commit()
    return {"status": True, "message": "Order saved"}


def public_members(db: Session, department: str | None = None, featured: bool | None = None) -> list[dict]:
    q = db.query(TeamMember).filter(TeamMember.not_deleted(), TeamMember.status == Status.ACTIVE.value)
    if department:
        q = q.filter(TeamMember.department == department)
    if featured:
        q = q.filter(TeamMember.is_featured.is_(True))
    rows = q.order_by(TeamMember.sort_order.asc(), TeamMember.id.asc()).all()
    return [
        {k: v for k, v in _serialize(r).items() if k not in ("status", "sort_order", "created_at", "updated_at")}
        for r in rows
    ]
