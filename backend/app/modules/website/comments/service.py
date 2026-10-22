import logging
import time
from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.blog_comments.models import BlogComment
from app.modules.admin.blogs.models import Blog
from app.modules.admin.notifications.service import notify_admins
from app.modules.admin.settings.service import get_group
from app.modules.website.comments.schemas import CommentSubmitSchema
from app.shared.constants import admin_urls as urls
from app.shared.constants import permissions as P
from app.shared.constants.admin_urls import admin_url
from app.shared.enums import CommentStatus, PublishStatus
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import client_ip, user_agent

logger = logging.getLogger(__name__)

MIN_FILL_SECONDS = 3
MAX_FILL_SECONDS = 7 * 24 * 3600
RECEIVED = {"status": True, "message": "Thanks! Your comment will appear once it has been approved."}


def _blog_or_404(db: Session, slug: str) -> Blog:
    row = (
        db.query(Blog)
        .filter(
            Blog.slug == slug,
            Blog.not_deleted(),
            Blog.status == PublishStatus.PUBLISHED.value,
            Blog.published_at <= now(),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    return row


def _state(db: Session, blog: Blog) -> dict:
    config = get_group(db, "comments")
    enabled = bool(config.get("enabled"))
    open_ = enabled and bool(blog.comments_enabled)
    days = int(config.get("close_after_days") or 0)
    if open_ and days and blog.published_at and blog.published_at < now() - timedelta(days=days):
        open_ = False
    return {
        "enabled": enabled,
        "open": open_,
        "allow_replies": bool(config.get("allow_replies")),
        "max_depth": int(config.get("max_depth") or 1),
        "notify_admins": bool(config.get("notify_admins")),
    }


def list_comments(db: Session, slug: str):
    blog = _blog_or_404(db, slug)
    state = _state(db, blog)
    payload = {k: state[k] for k in ("enabled", "open", "allow_replies", "max_depth")}
    if not state["enabled"]:
        return {"status": True, "data": {**payload, "count": 0, "items": []}}

    rows = (
        db.query(BlogComment)
        .filter(BlogComment.blog_id == blog.id, BlogComment.status == CommentStatus.APPROVED.value)
        .order_by(BlogComment.created_at.asc(), BlogComment.id.asc())
        .all()
    )
    approved = {r.id for r in rows}
    children: dict[int | None, list[BlogComment]] = {}
    for row in rows:
        if row.parent_id is not None and row.parent_id not in approved:
            continue
        children.setdefault(row.parent_id, []).append(row)

    count = 0

    def build(parent_id: int | None, depth: int) -> list[dict]:
        nonlocal count
        nodes = []
        for row in children.get(parent_id, []):
            count += 1
            nodes.append({
                "id": row.id,
                "author_name": row.author_name,
                "body": row.body,
                "is_admin": row.is_admin,
                "depth": depth,
                "created_at": iso(row.created_at),
                "replies": build(row.id, depth + 1),
            })
        return nodes

    items = build(None, 1)
    return {"status": True, "data": {**payload, "count": count, "items": items}}


def _looks_like_bot(payload: CommentSubmitSchema) -> bool:
    if payload.website:
        return True
    if not payload.started_at or payload.started_at <= 0:
        return True
    elapsed = time.time() - payload.started_at / 1000
    return not (MIN_FILL_SECONDS <= elapsed <= MAX_FILL_SECONDS)


def _closed(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def _depth(db: Session, comment: BlogComment) -> int:
    depth, seen, current = 1, {comment.id}, comment
    while current.parent_id and current.parent_id not in seen:
        current = db.get(BlogComment, current.parent_id)
        if current is None:
            break
        seen.add(current.id)
        depth += 1
    return depth


def submit(db: Session, slug: str, payload: CommentSubmitSchema, request: Request):
    blog = _blog_or_404(db, slug)
    state = _state(db, blog)
    if not state["open"]:
        raise _closed("Comments are closed for this post.")

    parent = None
    if payload.parent_id:
        if not state["allow_replies"]:
            raise _closed("Replies are turned off.")
        parent = db.get(BlogComment, payload.parent_id)
        if not parent or parent.blog_id != blog.id or parent.status != CommentStatus.APPROVED.value:
            raise HTTPException(status_code=422, detail={"errors": {"parent_id": ["That comment can't be replied to."]}})
        if _depth(db, parent) >= state["max_depth"]:
            raise HTTPException(status_code=422, detail={"errors": {"parent_id": ["This conversation can't go any deeper."]}})

    if _looks_like_bot(payload):
        logger.info("Blog comment dropped as bot (%s)", payload.author_email)
        return RECEIVED

    row = BlogComment(
        blog_id=blog.id,
        parent_id=parent.id if parent else None,
        author_name=payload.author_name,
        author_email=str(payload.author_email).lower(),
        body=payload.body,
        status=CommentStatus.PENDING.value,
        ip_address=client_ip(request),
        user_agent=(user_agent(request) or "")[:500] or None,
    )
    db.add(row)
    db.flush()
    if state["notify_admins"]:
        notify_admins(
            db,
            permission=P.COMMENTS_VIEW,
            type="comment.new",
            title="New comment awaiting approval",
            message=f"{row.author_name} on “{blog.title}”: {row.body[:80]}",
            url=admin_url(urls.COMMENTS, comment=row.id),
        )
    log_activity(db, "created", request=request, subject_type="blog_comment", subject_id=row.id,
                 subject_label=f"{row.author_name}: {row.body[:60]}",
                 description=f"Comment submitted on “{blog.title}”")
    db.commit()
    return RECEIVED
