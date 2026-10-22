from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blog_categories.schemas import BlogCategoryCreateSchema, BlogCategoryUpdateSchema
from app.modules.admin.blogs.models import blog_category_blog
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_slug

SUBJECT = "blog_category"


def _serialize(row: BlogCategory, blog_count: int | None = None) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "parent_id": row.parent_id,
        "parent": {"id": row.parent.id, "name": row.parent.name} if row.parent else None,
        "description": row.description,
        "image": row.image,
        "status": row.status,
        "blog_count": blog_count,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: BlogCategory) -> dict:
    return {"name": row.name, "slug": row.slug, "parent_id": row.parent_id,
            "description": row.description, "image": row.image, "status": row.status}


def _get_or_404(db: Session, category_id: int) -> BlogCategory:
    row = (
        db.query(BlogCategory)
        .options(joinedload(BlogCategory.parent))
        .filter(BlogCategory.id == category_id, BlogCategory.not_deleted())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Blog category not found")
    return row


def _slug_taken(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    q = db.query(BlogCategory.id).filter(BlogCategory.slug == slug, BlogCategory.not_deleted())
    if exclude_id is not None:
        q = q.filter(BlogCategory.id != exclude_id)
    return db.query(q.exists()).scalar()


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _prepare(db: Session, payload, exclude_id: int | None = None) -> dict:
    data = payload.model_dump()
    data["status"] = payload.status.value
    data["slug"] = normalize_slug(data.get("slug") or data["name"])
    if not data["slug"]:
        raise _field_error("slug", "Slug is required")
    if _slug_taken(db, data["slug"], exclude_id):
        raise _field_error("slug", "This slug is already in use")
    if data.get("parent_id"):
        if exclude_id is not None and data["parent_id"] == exclude_id:
            raise _field_error("parent_id", "A category can't be its own parent")
        _get_or_404(db, data["parent_id"])
        if exclude_id is not None and _is_descendant(db, data["parent_id"], exclude_id):
            raise _field_error("parent_id", "A category can't be moved under one of its own subcategories")
    return data


def _is_descendant(db: Session, category_id: int, ancestor_id: int) -> bool:
    seen: set[int] = set()
    current = category_id
    while current is not None and current not in seen:
        if current == ancestor_id:
            return True
        seen.add(current)
        current = db.query(BlogCategory.parent_id).filter(BlogCategory.id == current).scalar()
    return False


def _post_counts(db: Session):
    return (
        db.query(blog_category_blog.c.blog_category_id, func.count().label("total"))
        .group_by(blog_category_blog.c.blog_category_id)
        .subquery()
    )


def list_categories(db: Session, page=None, per_page=None, search=None, status=None, parent_id=None,
                    filters: str | None = None, match: str | None = "and", sort: str | None = None):
    counts = _post_counts(db)
    posts = func.coalesce(counts.c.total, 0)
    q = (
        db.query(BlogCategory, posts)
        .outerjoin(counts, counts.c.blog_category_id == BlogCategory.id)
        .options(joinedload(BlogCategory.parent))
        .filter(BlogCategory.not_deleted())
    )
    clause = search_clause([BlogCategory.name, BlogCategory.slug, BlogCategory.description], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(BlogCategory.status == status)
    if parent_id:
        q = q.filter(BlogCategory.parent_id == parent_id)
    fields = {
        "name": GridField(BlogCategory.name, "text"),
        "slug": GridField(BlogCategory.slug, "text"),
        "parent": GridField(BlogCategory.parent_id, "enum", sortable=False, cast=int),
        "description": GridField(BlogCategory.description, "text", sortable=False),
        "posts": GridField(posts, "number"),
        "status": GridField(BlogCategory.status, "enum"),
        "image": GridField(BlogCategory.image.isnot(None), "bool", sortable=False),
        "created_at": GridField(BlogCategory.created_at, "date"),
        "updated_at": GridField(BlogCategory.updated_at, "date"),
    }
    q = apply_filters(q, fields, filters, match)
    q = apply_sort(q, fields, sort, [BlogCategory.id.desc()])
    return list_response(q, lambda r: _serialize(r[0], r[1]), page, per_page, search)


def stats(db: Session):
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(BlogCategory.id)).filter(BlogCategory.not_deleted(), *filters).scalar() or 0

    counts = _post_counts(db)
    empty = (
        db.query(func.count(BlogCategory.id))
        .outerjoin(counts, counts.c.blog_category_id == BlogCategory.id)
        .filter(BlogCategory.not_deleted(), counts.c.total.is_(None))
        .scalar()
        or 0
    )
    return {
        "status": True,
        "data": {
            "total": count(),
            "active": count(BlogCategory.status == Status.ACTIVE.value),
            "inactive": count(BlogCategory.status == Status.INACTIVE.value),
            "top_level": count(BlogCategory.parent_id.is_(None)),
            "subcategories": count(BlogCategory.parent_id.isnot(None)),
            "empty": empty,
            "this_week": count(BlogCategory.created_at >= week_start),
            "last_week": count(BlogCategory.created_at >= week_start - timedelta(days=7),
                               BlogCategory.created_at < week_start),
        },
    }


def get_category(db: Session, category_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, category_id))}


def create_category(db: Session, payload: BlogCategoryCreateSchema, request: Request):
    row = BlogCategory(**_prepare(db, payload))
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Blog category created", "data": _serialize(_get_or_404(db, row.id))}


def update_category(db: Session, category_id: int, payload: BlogCategoryUpdateSchema, request: Request):
    row = _get_or_404(db, category_id)
    before = _snapshot(row)
    for key, value in _prepare(db, payload, exclude_id=row.id).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Blog category updated", "data": _serialize(_get_or_404(db, row.id))}


def toggle_status(db: Session, category_id: int, request: Request):
    row = _get_or_404(db, category_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Category {row.status}", "data": _serialize(row)}


def delete_category(db: Session, category_id: int, request: Request):
    row = _get_or_404(db, category_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Blog category moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(BlogCategory).filter(BlogCategory.id.in_(payload.ids), BlogCategory.not_deleted()).all()
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
    return {"status": True, "message": f"{len(rows)} categories updated"}
