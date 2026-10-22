from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased, joinedload

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.blog_comments.models import BlogComment
from app.modules.admin.blog_comments.schemas import (
    CommentBulkSchema,
    CommentReplySchema,
    CommentUpdateSchema,
)
from app.modules.admin.blogs.models import Blog
from app.shared.enums import CommentStatus
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.request_meta import client_ip, user_agent
from app.shared.utils.search import search_clause

SUBJECT = "blog_comment"
BULK_STATUS = {
    "approve": CommentStatus.APPROVED.value,
    "reject": CommentStatus.REJECTED.value,
    "spam": CommentStatus.SPAM.value,
    "pending": CommentStatus.PENDING.value,
}

_Parent = aliased(BlogComment)
_REPLIES = (
    select(func.count(_Parent.id)).where(_Parent.parent_id == BlogComment.id).correlate(BlogComment).scalar_subquery()
)
_BLOG_TITLE = select(Blog.title).where(Blog.id == BlogComment.blog_id).correlate(BlogComment).scalar_subquery()

GRID_FIELDS = {
    "id": GridField(BlogComment.id, "number"),
    "author_name": GridField(BlogComment.author_name, "text"),
    "author_email": GridField(BlogComment.author_email, "text"),
    "body": GridField(BlogComment.body, "text", sortable=False),
    "blog": GridField(BlogComment.blog_id, "enum", cast=int),
    "blog_title": GridField(_BLOG_TITLE, "text"),
    "status": GridField(BlogComment.status, "enum"),
    "is_admin": GridField(BlogComment.is_admin, "bool"),
    "is_reply": GridField(BlogComment.parent_id.isnot(None), "bool"),
    "replies": GridField(_REPLIES, "number"),
    "ip_address": GridField(BlogComment.ip_address, "text"),
    "created_at": GridField(BlogComment.created_at, "date"),
    "approved_at": GridField(BlogComment.approved_at, "date"),
}


def _excerpt(text: str | None, limit: int = 120) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def _label(row: BlogComment) -> str:
    return f"{row.author_name}: {_excerpt(row.body, 60)}"


def _serialize(row: BlogComment, replies: int | None = None) -> dict:
    return {
        "id": row.id,
        "blog_id": row.blog_id,
        "blog": {"id": row.blog.id, "title": row.blog.title, "slug": row.blog.slug,
                 "comments_enabled": row.blog.comments_enabled} if row.blog else None,
        "parent_id": row.parent_id,
        "parent": {"id": row.parent.id, "author_name": row.parent.author_name,
                   "body": _excerpt(row.parent.body), "status": row.parent.status} if row.parent else None,
        "author_name": row.author_name,
        "author_email": row.author_email,
        "body": row.body,
        "status": row.status,
        "is_admin": row.is_admin,
        "user": {"id": row.user.id, "name": row.user.name} if row.user else None,
        "replies_count": replies,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        "approved_at": iso(row.approved_at),
        "approved_by": {"id": row.approver.id, "name": row.approver.name} if row.approver else None,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: BlogComment) -> dict:
    return {"author_name": row.author_name, "author_email": row.author_email, "body": row.body,
            "status": row.status, "blog_id": row.blog_id, "parent_id": row.parent_id}


def _query(db: Session):
    return db.query(BlogComment).options(
        joinedload(BlogComment.blog),
        joinedload(BlogComment.parent),
        joinedload(BlogComment.user),
        joinedload(BlogComment.approver),
    )


def _get_or_404(db: Session, comment_id: int) -> BlogComment:
    row = _query(db).filter(BlogComment.id == comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    return row


def _set_status(row: BlogComment, value: str, user_id: int | None) -> None:
    row.status = value
    if value == CommentStatus.APPROVED.value:
        row.approved_at = row.approved_at or now()
        row.approved_by = row.approved_by or user_id
    else:
        row.approved_at = None
        row.approved_by = None


def list_comments(db: Session, page=None, per_page=None, search=None, status=None, blog_id=None,
                  filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(BlogComment, _REPLIES).options(
        joinedload(BlogComment.blog), joinedload(BlogComment.parent), joinedload(BlogComment.user),
        joinedload(BlogComment.approver),
    )
    clause = search_clause([BlogComment.author_name, BlogComment.author_email, BlogComment.body], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(BlogComment.status == status)
    if blog_id:
        q = q.filter(BlogComment.blog_id == blog_id)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [BlogComment.id.desc()])
    return list_response(q, lambda r: _serialize(r[0], r[1]), page, per_page, search)


def stats(db: Session):
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(BlogComment.id)).filter(*filters).scalar() or 0

    by_status = dict(db.query(BlogComment.status, func.count(BlogComment.id)).group_by(BlogComment.status).all())
    blogs = (
        db.query(Blog.id, Blog.title)
        .join(BlogComment, BlogComment.blog_id == Blog.id)
        .distinct()
        .order_by(Blog.title)
        .limit(300)
        .all()
    )
    return {
        "status": True,
        "data": {
            "total": count(),
            "pending": by_status.get(CommentStatus.PENDING.value, 0),
            "approved": by_status.get(CommentStatus.APPROVED.value, 0),
            "rejected": by_status.get(CommentStatus.REJECTED.value, 0),
            "spam": by_status.get(CommentStatus.SPAM.value, 0),
            "admin_replies": count(BlogComment.is_admin.is_(True)),
            "today": count(BlogComment.created_at >= today_start),
            "this_week": count(BlogComment.created_at >= week_start),
            "last_week": count(BlogComment.created_at >= week_start - timedelta(days=7),
                               BlogComment.created_at < week_start),
            "blogs": [{"id": bid, "title": title} for bid, title in blogs],
        },
    }


def _thread(db: Session, row: BlogComment) -> list[dict]:
    root = row
    seen = {root.id}
    while root.parent_id and root.parent_id not in seen:
        parent = db.get(BlogComment, root.parent_id)
        if parent is None:
            break
        seen.add(parent.id)
        root = parent
    rows = (
        db.query(BlogComment)
        .options(joinedload(BlogComment.user))
        .filter(BlogComment.blog_id == row.blog_id)
        .order_by(BlogComment.created_at.asc(), BlogComment.id.asc())
        .all()
    )
    children: dict[int | None, list[BlogComment]] = {}
    for item in rows:
        children.setdefault(item.parent_id, []).append(item)

    flat: list[dict] = []

    def walk(node: BlogComment, depth: int) -> None:
        flat.append({
            "id": node.id,
            "parent_id": node.parent_id,
            "depth": depth,
            "author_name": node.author_name,
            "body": node.body,
            "status": node.status,
            "is_admin": node.is_admin,
            "created_at": iso(node.created_at),
        })
        for child in children.get(node.id, []):
            walk(child, depth + 1)

    walk(root, 0)
    return flat


def get_comment(db: Session, comment_id: int):
    row = _get_or_404(db, comment_id)
    replies = db.query(func.count(BlogComment.id)).filter(BlogComment.parent_id == row.id).scalar() or 0
    data = _serialize(row, replies)
    data["thread"] = _thread(db, row)
    return {"status": True, "data": data}


def update_comment(db: Session, comment_id: int, payload: CommentUpdateSchema, request: Request):
    row = _get_or_404(db, comment_id)
    before = _snapshot(row)
    row.author_name = payload.author_name
    row.author_email = str(payload.author_email).lower() if payload.author_email else None
    row.body = payload.body
    old, new = diff(before, _snapshot(row))
    if old or new:
        log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=_label(row), old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Comment updated", "data": get_comment(db, row.id)["data"]}


def change_status(db: Session, comment_id: int, value: str, request: Request):
    row = _get_or_404(db, comment_id)
    before = row.status
    if before != value:
        _set_status(row, value, get_current_user(request).id)
        log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=_label(row), old_values={"status": before}, new_values={"status": value})
    db.commit()
    return {"status": True, "message": f"Comment {value}", "data": get_comment(db, row.id)["data"]}


def reply(db: Session, comment_id: int, payload: CommentReplySchema, request: Request):
    parent = _get_or_404(db, comment_id)
    user = get_current_user(request)
    if parent.status != CommentStatus.APPROVED.value:
        before = parent.status
        _set_status(parent, CommentStatus.APPROVED.value, user.id)
        log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=parent.id,
                     subject_label=_label(parent), description="Approved when replying",
                     old_values={"status": before}, new_values={"status": parent.status})
    row = BlogComment(
        blog_id=parent.blog_id,
        parent_id=parent.id,
        user_id=user.id,
        author_name=user.name,
        author_email=user.email,
        body=payload.body,
        is_admin=True,
        ip_address=client_ip(request),
        user_agent=(user_agent(request) or "")[:500] or None,
    )
    _set_status(row, CommentStatus.APPROVED.value, user.id)
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), description=f"Replied to {parent.author_name}",
                 new_values={"body": row.body, "parent_id": parent.id})
    db.commit()
    return {"status": True, "message": "Reply published", "data": get_comment(db, row.id)["data"]}


def delete_comment(db: Session, comment_id: int, request: Request):
    row = _get_or_404(db, comment_id)
    replies = db.query(func.count(BlogComment.id)).filter(BlogComment.parent_id == row.id).scalar() or 0
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), old_values=_snapshot(row),
                 description=f"Deleted with {replies} direct replies" if replies else None)
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Comment deleted"}


def bulk_action(db: Session, payload: CommentBulkSchema, request: Request):
    user = get_current_user(request)
    rows = _query(db).filter(BlogComment.id.in_(payload.ids)).all()
    if payload.action == "delete":
        for row in rows:
            log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                         subject_label=_label(row), description="Deleted in a bulk action",
                         old_values=_snapshot(row))
            db.delete(row)
        db.commit()
        return {"status": True, "message": f"{len(rows)} comments deleted"}

    value = BULK_STATUS[payload.action]
    changed = 0
    for row in rows:
        if row.status == value:
            continue
        before = row.status
        _set_status(row, value, user.id)
        log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=_label(row), description="Changed in a bulk action",
                     old_values={"status": before}, new_values={"status": value})
        changed += 1
    db.commit()
    return {"status": True, "message": f"{changed} comments marked {value}"}


def pending_count(db: Session) -> int:
    return (
        db.query(func.count(BlogComment.id))
        .filter(BlogComment.status == CommentStatus.PENDING.value)
        .scalar()
        or 0
    )
