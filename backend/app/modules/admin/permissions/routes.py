from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.permissions import service
from app.modules.admin.permissions.schemas import PermissionCreateSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/permissions", tags=["Admin Permissions"])

_CAN_READ = require_admin_permission(P.PERMISSIONS_VIEW, P.ROLES_VIEW, P.USERS_VIEW)


@router.get("/", dependencies=[Depends(_CAN_READ)])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    group: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_permissions(db, page, per_page, search, group)


@router.get("/grouped", dependencies=[Depends(_CAN_READ)])
def grouped(db: Session = Depends(get_db)):
    return service.grouped(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.PERMISSIONS_CREATE))])
def store(payload: PermissionCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_permission(db, payload, request)


@router.delete("/{permission_id}", dependencies=[Depends(require_admin_permission(P.PERMISSIONS_DELETE))])
def destroy(permission_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_permission(db, permission_id, request)
