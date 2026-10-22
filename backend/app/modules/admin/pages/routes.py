from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.pages import service
from app.modules.admin.pages.schemas import PageCreateSchema, PageUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import PublishStatus
from app.shared.pagination import OptionalId
from app.shared.utils.bulk import BulkActionSchema

router = APIRouter(prefix="/pages", tags=["Admin Pages"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.PAGES_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: PublishStatus | None = None,
    author_id: OptionalId = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_pages(db, page, per_page, search, status.value if status else None, author_id,
                              filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.PAGES_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.PAGES_CREATE))])
def store(payload: PageCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_page(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.PAGES_UPDATE, P.PAGES_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.PAGES_UPDATE, P.PAGES_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{page_id}", dependencies=[Depends(require_admin_permission(P.PAGES_VIEW))])
def show(page_id: int, db: Session = Depends(get_db)):
    return service.get_page(db, page_id)


@router.put("/{page_id}", dependencies=[Depends(require_admin_permission(P.PAGES_UPDATE))])
def update(page_id: int, payload: PageUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_page(db, page_id, payload, request)


@router.patch("/{page_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.PAGES_UPDATE))])
def toggle_status(page_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, page_id, request)


@router.delete("/{page_id}", dependencies=[Depends(require_admin_permission(P.PAGES_DELETE))])
def destroy(page_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_page(db, page_id, request)
