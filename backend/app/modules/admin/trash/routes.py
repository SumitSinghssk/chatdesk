from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.trash import service
from app.shared.constants import permissions as P
from app.shared.utils.bulk import IdsSchema

router = APIRouter(prefix="/trash", tags=["Admin Trash"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.TRASH_VIEW))])
def index(db: Session = Depends(get_db)):
    return service.summary(db)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.TRASH_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.get("/{type}", dependencies=[Depends(require_admin_permission(P.TRASH_VIEW))])
def show(
    type: str,
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_items(db, type, page, per_page, search, sort, filters, match)


@router.post("/{type}/restore", dependencies=[Depends(require_admin_permission(P.TRASH_RESTORE))])
def restore(type: str, payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.restore(db, type, payload.ids, request)


@router.delete("/{type}/empty", dependencies=[Depends(require_admin_permission(P.TRASH_DELETE))])
def empty(type: str, request: Request, db: Session = Depends(get_db)):
    return service.empty(db, type, request)


@router.delete("/{type}", dependencies=[Depends(require_admin_permission(P.TRASH_DELETE))])
def destroy(type: str, payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.delete_forever(db, type, payload.ids, request)
