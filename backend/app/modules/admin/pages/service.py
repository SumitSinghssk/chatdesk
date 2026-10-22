from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.pages.models import Page
from app.modules.admin.pages.schemas import PageCreateSchema, PageUpdateSchema
from app.shared.enums import PublishStatus
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.modules.admin.users.models import User
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.html import clean_html
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_slug

SUBJECT = "page"


def _serialize(row: Page, with_content: bool = False) -> dict:
    data = {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "featured_image": row.featured_image,
        "status": row.status,
        "published_at": iso(row.published_at),
        "meta_title": row.meta_title,
        "meta_description": row.meta_description,
        "author": {"id": row.author.id, "name": row.author.name} if row.author else None,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }
    if with_content:
        data["content"] = row.content
    return data


def _snapshot(row: Page) -> dict:
    return {"title": row.title, "slug": row.slug, "featured_image": row.featured_image, "status": row.status,
            "published_at": iso(row.published_at), "meta_title": row.meta_title,
            "meta_description": row.meta_description}


def _get_or_404(db: Session, page_id: int) -> Page:
    row = (
        db.query(Page)
        .options(joinedload(Page.author))
        .filter(Page.id == page_id, Page.not_deleted())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return row


def _slug_taken(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    q = db.query(Page.id).filter(Page.slug == slug, Page.not_deleted())
    if exclude_id is not None:
        q = q.filter(Page.id != exclude_id)
    return db.query(q.exists()).scalar()


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _prepare(db: Session, payload, exclude_id: int | None = None) -> dict:
    unsent_meta = {"meta_title", "meta_description"} - payload.model_fields_set
    data = payload.model_dump(exclude=unsent_meta)
    data["status"] = payload.status.value
    data["content"] = clean_html(data.get("content"))
    data["slug"] = normalize_slug(data.get("slug") or data["title"])
    if not data["slug"]:
        raise _field_error("slug", "Slug is required")
    if _slug_taken(db, data["slug"], exclude_id):
        raise _field_error("slug", "This slug is already in use")
    if data["status"] == PublishStatus.PUBLISHED.value and not data.get("published_at"):
        data["published_at"] = now()
    return data


_AUTHOR_NAME = select(User.name).where(User.id == Page.author_id).correlate(Page).scalar_subquery()

GRID_FIELDS = {
    "id": GridField(Page.id, "number"),
    "title": GridField(Page.title, "text"),
    "slug": GridField(Page.slug, "text"),
    "status": GridField(Page.status, "enum"),
    "published_at": GridField(Page.published_at, "date"),
    "author": GridField(_AUTHOR_NAME, "text"),
    "featured_image": GridField(and_(Page.featured_image.isnot(None), Page.featured_image != ""), "bool",
                                sortable=False),
    "created_at": GridField(Page.created_at, "date"),
    "updated_at": GridField(Page.updated_at, "date"),
}


def _grid_fields() -> dict[str, GridField]:
    scheduled = and_(Page.status == PublishStatus.PUBLISHED.value, Page.published_at > now())
    return {**GRID_FIELDS, "scheduled": GridField(scheduled, "bool", sortable=False)}


def list_pages(db: Session, page=None, per_page=None, search=None, status=None, author_id=None,
               filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(Page).options(joinedload(Page.author)).filter(Page.not_deleted())
    clause = search_clause([Page.title, Page.slug], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Page.status == status)
    if author_id:
        q = q.filter(Page.author_id == author_id)
    q = apply_filters(q, _grid_fields(), filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Page.id.desc()])
    return list_response(q, _serialize, page, per_page, search)


def get_page(db: Session, page_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, page_id), with_content=True)}


def stats(db: Session):
    current = now()
    month_start = current - timedelta(days=30)

    def count(*filters) -> int:
        return db.query(func.count(Page.id)).filter(Page.not_deleted(), *filters).scalar() or 0

    rows = db.query(Page.status, func.count(Page.id)).filter(Page.not_deleted()).group_by(Page.status).all()
    counts = {s: c for s, c in rows}
    return {"status": True, "data": {
        "total": sum(counts.values()),
        "published": counts.get(PublishStatus.PUBLISHED.value, 0),
        "draft": counts.get(PublishStatus.DRAFT.value, 0),
        "scheduled": count(Page.status == PublishStatus.PUBLISHED.value, Page.published_at > current),
        "updated_30_days": count(Page.updated_at >= month_start),
        "without_image": count(or_(Page.featured_image.is_(None), Page.featured_image == "")),
    }}


def create_page(db: Session, payload: PageCreateSchema, request: Request):
    row = Page(**_prepare(db, payload), author_id=get_current_user(request).id)
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Page created", "data": _serialize(_get_or_404(db, row.id), with_content=True)}


def update_page(db: Session, page_id: int, payload: PageUpdateSchema, request: Request):
    row = _get_or_404(db, page_id)
    before = _snapshot(row)
    for key, value in _prepare(db, payload, exclude_id=row.id).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Page updated", "data": _serialize(_get_or_404(db, row.id), with_content=True)}


def _set_status(row: Page, value: str) -> None:
    row.status = value
    if value == PublishStatus.PUBLISHED.value and not row.published_at:
        row.published_at = now()


def toggle_status(db: Session, page_id: int, request: Request):
    row = _get_or_404(db, page_id)
    before = row.status
    _set_status(row, PublishStatus.DRAFT.value if row.status == PublishStatus.PUBLISHED.value
                else PublishStatus.PUBLISHED.value)
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Page {row.status}", "data": _serialize(_get_or_404(db, row.id))}


def delete_page(db: Session, page_id: int, request: Request):
    row = _get_or_404(db, page_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Page moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Page).filter(Page.id.in_(payload.ids), Page.not_deleted()).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    for row in rows:
        if payload.action == "delete":
            row.deleted_at = now()
        else:
            _set_status(row, PublishStatus.PUBLISHED.value if payload.action == "activate"
                        else PublishStatus.DRAFT.value)
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: r.title,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    return {"status": True, "message": f"{len(rows)} pages updated"}
