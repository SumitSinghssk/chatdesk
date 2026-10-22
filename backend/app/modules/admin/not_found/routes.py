from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.not_found import service
from app.modules.admin.not_found.schemas import NotFoundRedirectSchema
from app.shared.constants import permissions as P
from app.shared.utils.bulk import IdsSchema

router = APIRouter(prefix="/not-found", tags=["Admin 404 Log"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    tab: Literal["open", "redirected", "ignored", "all"] = "open",
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_logs(db, page, per_page, search, tab, sort, filters, match)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post(
    "/redirect",
    dependencies=[Depends(require_admin_permission(P.NOT_FOUND_MANAGE)),
                  Depends(require_admin_permission(P.REDIRECTS_CREATE))],
)
def redirect(payload: NotFoundRedirectSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_redirect(db, payload, request)


@router.post("/ignore", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_MANAGE))])
def ignore(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.set_ignored(db, payload, True, request)


@router.post("/unignore", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_MANAGE))])
def unignore(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.set_ignored(db, payload, False, request)


@router.delete("/clear", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_MANAGE))])
def clear(request: Request, db: Session = Depends(get_db)):
    return service.clear_logs(db, request)


@router.delete("/", dependencies=[Depends(require_admin_permission(P.NOT_FOUND_MANAGE))])
def destroy(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.delete_logs(db, payload, request)
