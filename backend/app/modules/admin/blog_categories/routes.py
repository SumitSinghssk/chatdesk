from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.blog_categories import service
from app.modules.admin.blog_categories.schemas import BlogCategoryCreateSchema, BlogCategoryUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.pagination import OptionalId
from app.shared.utils.bulk import BulkActionSchema

router = APIRouter(prefix="/blog-categories", tags=["Admin Blog Categories"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_VIEW, P.BLOGS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    parent_id: OptionalId = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_categories(db, page, per_page, search, status.value if status else None, parent_id,
                                   filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_CREATE))])
def store(payload: BlogCategoryCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_category(db, payload, request)


@router.post(
    "/bulk",
    dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_UPDATE, P.BLOG_CATEGORIES_DELETE))],
)
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.BLOG_CATEGORIES_UPDATE, P.BLOG_CATEGORIES_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{category_id}", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_VIEW))])
def show(category_id: int, db: Session = Depends(get_db)):
    return service.get_category(db, category_id)


@router.put("/{category_id}", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_UPDATE))])
def update(category_id: int, payload: BlogCategoryUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_category(db, category_id, payload, request)


@router.patch("/{category_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_UPDATE))])
def toggle_status(category_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, category_id, request)


@router.delete("/{category_id}", dependencies=[Depends(require_admin_permission(P.BLOG_CATEGORIES_DELETE))])
def destroy(category_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_category(db, category_id, request)
