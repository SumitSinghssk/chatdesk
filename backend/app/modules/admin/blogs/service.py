import json
from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blog_comments.models import BlogComment
from app.modules.admin.blogs.models import Blog
from app.modules.admin.blogs.schemas import BlogCreateSchema, BlogUpdateSchema
from app.shared.enums import CommentStatus, PublishStatus
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.modules.admin.users.models import User
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.html import clean_html
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_slug

SUBJECT = "blog"


def _serialize(row: Blog, with_content: bool = False) -> dict:
    categories = [c for c in (row.categories or []) if c.deleted_at is None]
    data = {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "excerpt": row.excerpt,
        "featured_image": row.featured_image,
        "status": row.status,
        "published_at": iso(row.published_at),
        "meta_title": row.meta_title,
        "meta_description": row.meta_description,
        "comments_enabled": row.comments_enabled,
        "author": {"id": row.author.id, "name": row.author.name} if row.author else None,
        "categories": [{"id": c.id, "name": c.name, "slug": c.slug} for c in categories],
        "category_ids": [c.id for c in categories],
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }
    if with_content:
        data["content"] = row.content
    return data


def _snapshot(row: Blog) -> dict:
    return {"title": row.title, "slug": row.slug, "excerpt": row.excerpt, "featured_image": row.featured_image,
            "status": row.status, "published_at": iso(row.published_at), "meta_title": row.meta_title,
            "meta_description": row.meta_description, "comments_enabled": row.comments_enabled,
            "category_ids": sorted(c.id for c in (row.categories or []))}


def _get_or_404(db: Session, blog_id: int) -> Blog:
    row = (
        db.query(Blog)
        .options(joinedload(Blog.author), selectinload(Blog.categories))
        .filter(Blog.id == blog_id, Blog.not_deleted())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    return row


def _slug_taken(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    q = db.query(Blog.id).filter(Blog.slug == slug, Blog.not_deleted())
    if exclude_id is not None:
        q = q.filter(Blog.id != exclude_id)
    return db.query(q.exists()).scalar()


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _prepare(db: Session, payload, exclude_id: int | None = None) -> tuple[dict, list[BlogCategory]]:
    unsent_meta = {"meta_title", "meta_description"} - payload.model_fields_set
    data = payload.model_dump(exclude={"category_ids", *unsent_meta})
    data["status"] = payload.status.value
    data["content"] = clean_html(data.get("content"))
    data["slug"] = normalize_slug(data.get("slug") or data["title"])
    if not data["slug"]:
        raise _field_error("slug", "Slug is required")
    if _slug_taken(db, data["slug"], exclude_id):
        raise _field_error("slug", "This slug is already in use")
    if data["status"] == PublishStatus.PUBLISHED.value and not data.get("published_at"):
        data["published_at"] = now()

    ids = list(dict.fromkeys(payload.category_ids or []))
    categories: list[BlogCategory] = []
    if ids:
        categories = db.query(BlogCategory).filter(BlogCategory.id.in_(ids), BlogCategory.not_deleted()).all()
        if len(categories) != len(ids):
            raise _field_error("category_ids", "One or more selected categories do not exist")
    return data, categories


_COMMENTS = (
    select(func.count(BlogComment.id)).where(BlogComment.blog_id == Blog.id).correlate(Blog).scalar_subquery()
)
_PENDING_COMMENTS = (
    select(func.count(BlogComment.id))
    .where(BlogComment.blog_id == Blog.id, BlogComment.status == CommentStatus.PENDING.value)
    .correlate(Blog)
    .scalar_subquery()
)

_AUTHOR_NAME = select(User.name).where(User.id == Blog.author_id).correlate(Blog).scalar_subquery()

GRID_FIELDS = {
    "id": GridField(Blog.id, "number"),
    "title": GridField(Blog.title, "text"),
    "slug": GridField(Blog.slug, "text"),
    "excerpt": GridField(Blog.excerpt, "text", sortable=False),
    "status": GridField(Blog.status, "enum"),
    "published_at": GridField(Blog.published_at, "date"),
    "author": GridField(_AUTHOR_NAME, "text"),
    "featured_image": GridField(and_(Blog.featured_image.isnot(None), Blog.featured_image != ""), "bool",
                                sortable=False),
    "comments": GridField(_COMMENTS, "number"),
    "pending_comments": GridField(_PENDING_COMMENTS, "number"),
    "comments_enabled": GridField(Blog.comments_enabled, "bool"),
    "created_at": GridField(Blog.created_at, "date"),
    "updated_at": GridField(Blog.updated_at, "date"),
}
CATEGORY_OPS = {"in", "not_in", "is_empty", "is_not_empty"}


def _grid_fields() -> dict[str, GridField]:
    scheduled = and_(Blog.status == PublishStatus.PUBLISHED.value, Blog.published_at > now())
    return {**GRID_FIELDS, "scheduled": GridField(scheduled, "bool", sortable=False)}


def _category_clause(op: str, value):
    if op == "is_empty":
        return ~Blog.categories.any(BlogCategory.not_deleted())
    if op == "is_not_empty":
        return Blog.categories.any(BlogCategory.not_deleted())
    values = value if isinstance(value, list) else [value]
    try:
        ids = [int(v) for v in values if v not in (None, "")][:100]
    except (TypeError, ValueError):
        raise _field_error("filters", "Pick a valid category") from None
    if not ids:
        return None
    match = Blog.categories.any(BlogCategory.id.in_(ids))
    return match if op == "in" else ~match


def _apply_grid_filters(db: Session, q, raw: str | None, match: str | None):
    try:
        rules = json.loads(raw) if raw else []
    except ValueError:
        rules = None
    if not isinstance(rules, list) or not any(isinstance(r, dict) and r.get("field") == "categories" for r in rules):
        return apply_filters(q, _grid_fields(), raw, match)

    category_clauses = []
    for r in [r for r in rules if isinstance(r, dict) and r.get("field") == "categories"]:
        if r.get("op") not in CATEGORY_OPS:
            raise _field_error("filters", f"'{r.get('op')}' isn't a valid filter for categories")
        clause = _category_clause(r["op"], r.get("value"))
        if clause is not None:
            category_clauses.append(clause)
    rest = [r for r in rules if not (isinstance(r, dict) and r.get("field") == "categories")]
    rest_raw = json.dumps(rest) if rest else None

    if match == "or":
        clauses = list(category_clauses)
        if rest_raw:
            ids = apply_filters(db.query(Blog.id), _grid_fields(), rest_raw, "or").subquery()
            clauses.append(Blog.id.in_(select(ids.c.id)))
        return q.filter(or_(*clauses)) if clauses else q
    q = apply_filters(q, _grid_fields(), rest_raw, "and")
    return q.filter(and_(*category_clauses)) if category_clauses else q


def list_blogs(db: Session, page=None, per_page=None, search=None, status=None, category_id=None, author_id=None,
               filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = (
        db.query(Blog, _COMMENTS, _PENDING_COMMENTS)
        .options(joinedload(Blog.author), selectinload(Blog.categories))
        .filter(Blog.not_deleted())
    )
    clause = search_clause([Blog.title, Blog.excerpt, Blog.slug], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Blog.status == status)
    if category_id:
        q = q.filter(Blog.categories.any(BlogCategory.id == category_id))
    if author_id:
        q = q.filter(Blog.author_id == author_id)
    q = _apply_grid_filters(db, q, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Blog.id.desc()])
    return list_response(
        q, lambda r: {**_serialize(r[0]), "comments_count": r[1], "pending_comments": r[2]}, page, per_page, search
    )


def get_blog(db: Session, blog_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, blog_id), with_content=True)}


def stats(db: Session):
    current = now()
    month_start = current - timedelta(days=30)
    published = Blog.status == PublishStatus.PUBLISHED.value

    def count(*filters) -> int:
        return db.query(func.count(Blog.id)).filter(Blog.not_deleted(), *filters).scalar() or 0

    rows = db.query(Blog.status, func.count(Blog.id)).filter(Blog.not_deleted()).group_by(Blog.status).all()
    counts = {s: c for s, c in rows}
    return {"status": True, "data": {
        "total": sum(counts.values()),
        "published": counts.get(PublishStatus.PUBLISHED.value, 0),
        "draft": counts.get(PublishStatus.DRAFT.value, 0),
        "scheduled": count(published, Blog.published_at > current),
        "last_30_days": count(published, Blog.published_at >= month_start, Blog.published_at <= current),
        "previous_30_days": count(published, Blog.published_at >= month_start - timedelta(days=30),
                                  Blog.published_at < month_start),
        "without_image": count(or_(Blog.featured_image.is_(None), Blog.featured_image == "")),
        "uncategorized": count(~Blog.categories.any(BlogCategory.not_deleted())),
        "pending_comments": db.query(func.count(BlogComment.id))
        .filter(BlogComment.status == CommentStatus.PENDING.value).scalar() or 0,
    }}


def create_blog(db: Session, payload: BlogCreateSchema, request: Request):
    data, categories = _prepare(db, payload)
    row = Blog(**data, author_id=get_current_user(request).id)
    row.categories = categories
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Blog created", "data": _serialize(_get_or_404(db, row.id), with_content=True)}


def update_blog(db: Session, blog_id: int, payload: BlogUpdateSchema, request: Request):
    row = _get_or_404(db, blog_id)
    before = _snapshot(row)
    data, categories = _prepare(db, payload, exclude_id=row.id)
    for key, value in data.items():
        setattr(row, key, value)
    row.categories = categories
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Blog updated", "data": _serialize(_get_or_404(db, row.id), with_content=True)}


def _set_status(row: Blog, value: str) -> None:
    row.status = value
    if value == PublishStatus.PUBLISHED.value and not row.published_at:
        row.published_at = now()


def toggle_status(db: Session, blog_id: int, request: Request):
    row = _get_or_404(db, blog_id)
    before = row.status
    _set_status(row, PublishStatus.DRAFT.value if row.status == PublishStatus.PUBLISHED.value
                else PublishStatus.PUBLISHED.value)
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Blog {row.status}", "data": _serialize(_get_or_404(db, row.id))}


def delete_blog(db: Session, blog_id: int, request: Request):
    row = _get_or_404(db, blog_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Blog moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Blog).filter(Blog.id.in_(payload.ids), Blog.not_deleted()).all()
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
    return {"status": True, "message": f"{len(rows)} blogs updated"}
