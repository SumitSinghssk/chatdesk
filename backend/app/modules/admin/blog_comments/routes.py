from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.blog_comments import service
from app.modules.admin.blog_comments.schemas import (
    CommentBulkSchema,
    CommentReplySchema,
    CommentStatusSchema,
    CommentUpdateSchema,
)
from app.shared.constants import permissions as P
from app.shared.enums import CommentStatus
from app.shared.pagination import OptionalId

router = APIRouter(prefix="/comments", tags=["Admin Blog Comments"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.COMMENTS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: CommentStatus | None = None,
    blog_id: OptionalId = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_comments(db, page, per_page, search, status.value if status else None, blog_id,
                                 filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.COMMENTS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.COMMENTS_MODERATE, P.COMMENTS_DELETE))])
def bulk(payload: CommentBulkSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.COMMENTS_MODERATE, P.COMMENTS_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{comment_id}", dependencies=[Depends(require_admin_permission(P.COMMENTS_VIEW))])
def show(comment_id: int, db: Session = Depends(get_db)):
    return service.get_comment(db, comment_id)


@router.put("/{comment_id}", dependencies=[Depends(require_admin_permission(P.COMMENTS_MODERATE))])
def update(comment_id: int, payload: CommentUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_comment(db, comment_id, payload, request)


@router.patch("/{comment_id}/status", dependencies=[Depends(require_admin_permission(P.COMMENTS_MODERATE))])
def change_status(comment_id: int, payload: CommentStatusSchema, request: Request, db: Session = Depends(get_db)):
    return service.change_status(db, comment_id, payload.status.value, request)


@router.post("/{comment_id}/reply", dependencies=[Depends(require_admin_permission(P.COMMENTS_REPLY))])
def reply(comment_id: int, payload: CommentReplySchema, request: Request, db: Session = Depends(get_db)):
    return service.reply(db, comment_id, payload, request)


@router.delete("/{comment_id}", dependencies=[Depends(require_admin_permission(P.COMMENTS_DELETE))])
def destroy(comment_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_comment(db, comment_id, request)
