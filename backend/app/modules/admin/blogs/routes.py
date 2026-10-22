from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.blogs import service
from app.modules.admin.blogs.schemas import BlogCreateSchema, BlogUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import PublishStatus
from app.shared.pagination import OptionalId
from app.shared.utils.bulk import BulkActionSchema

router = APIRouter(prefix="/blogs", tags=["Admin Blogs"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.BLOGS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: PublishStatus | None = None,
    category_id: OptionalId = None,
    author_id: OptionalId = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_blogs(db, page, per_page, search, status.value if status else None, category_id, author_id,
                              filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.BLOGS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.BLOGS_CREATE))])
def store(payload: BlogCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_blog(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.BLOGS_UPDATE, P.BLOGS_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.BLOGS_UPDATE, P.BLOGS_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{blog_id}", dependencies=[Depends(require_admin_permission(P.BLOGS_VIEW))])
def show(blog_id: int, db: Session = Depends(get_db)):
    return service.get_blog(db, blog_id)


@router.put("/{blog_id}", dependencies=[Depends(require_admin_permission(P.BLOGS_UPDATE))])
def update(blog_id: int, payload: BlogUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_blog(db, blog_id, payload, request)


@router.patch("/{blog_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.BLOGS_UPDATE))])
def toggle_status(blog_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, blog_id, request)


@router.delete("/{blog_id}", dependencies=[Depends(require_admin_permission(P.BLOGS_DELETE))])
def destroy(blog_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_blog(db, blog_id, request)
