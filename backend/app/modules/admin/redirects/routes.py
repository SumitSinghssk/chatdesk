from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.redirects import service
from app.modules.admin.redirects.schemas import RedirectCreateSchema, RedirectUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.bulk import BulkActionSchema

ALLOWED_CODES = {301, 302, 307, 308}

router = APIRouter(prefix="/redirects", tags=["Admin Redirects"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.REDIRECTS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    status_code: int | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    if status_code is not None and status_code not in ALLOWED_CODES:
        raise HTTPException(status_code=422, detail={"errors": {"status_code": ["Allowed values: 301, 302, 307, 308"]}})
    return service.list_redirects(db, page, per_page, search, status.value if status else None, status_code,
                                  filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.REDIRECTS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.REDIRECTS_CREATE))])
def store(payload: RedirectCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_redirect(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.REDIRECTS_UPDATE, P.REDIRECTS_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.REDIRECTS_UPDATE, P.REDIRECTS_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{redirect_id}", dependencies=[Depends(require_admin_permission(P.REDIRECTS_VIEW))])
def show(redirect_id: int, db: Session = Depends(get_db)):
    return service.get_redirect(db, redirect_id)


@router.put("/{redirect_id}", dependencies=[Depends(require_admin_permission(P.REDIRECTS_UPDATE))])
def update(redirect_id: int, payload: RedirectUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_redirect(db, redirect_id, payload, request)


@router.patch("/{redirect_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.REDIRECTS_UPDATE))])
def toggle_status(redirect_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, redirect_id, request)


@router.delete("/{redirect_id}", dependencies=[Depends(require_admin_permission(P.REDIRECTS_DELETE))])
def destroy(redirect_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_redirect(db, redirect_id, request)
