from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.security import service
from app.modules.admin.security.schemas import IpBlockCreateSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/security", tags=["Admin Security"])

_VIEW = [Depends(require_admin_permission(P.SETTINGS_VIEW))]
_UPDATE = [Depends(require_admin_permission(P.SETTINGS_UPDATE))]


@router.get("/blocks", dependencies=_VIEW)
def blocks(request: Request, db: Session = Depends(get_db)):
    return service.list_blocks(db, request)


@router.post("/blocks", dependencies=_UPDATE)
def block(payload: IpBlockCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_block(db, payload, request)


@router.delete("/blocks/{block_id}", dependencies=_UPDATE)
def unblock(block_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_block(db, block_id, request)


@router.get("/requests", dependencies=_VIEW)
def requests(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    reason: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_requests(db, page, per_page, search, reason)


@router.delete("/requests", dependencies=_UPDATE)
def clear_requests(request: Request, db: Session = Depends(get_db)):
    return service.clear_requests(db, request)
