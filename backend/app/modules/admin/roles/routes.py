from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.roles import service
from app.modules.admin.roles.schemas import RoleCreateSchema, RoleUpdateSchema, TogglePermissionSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/roles", tags=["Admin Roles"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.ROLES_VIEW, P.USERS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_roles(db, page, per_page, search, filters, match, sort)


@router.post("/", dependencies=[Depends(require_admin_permission(P.ROLES_CREATE))])
def store(payload: RoleCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_role(db, payload, request)


@router.get("/{role_id}", dependencies=[Depends(require_admin_permission(P.ROLES_VIEW))])
def show(role_id: int, db: Session = Depends(get_db)):
    return service.get_role(db, role_id)


@router.put("/{role_id}", dependencies=[Depends(require_admin_permission(P.ROLES_UPDATE))])
def update(role_id: int, payload: RoleUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_role(db, role_id, payload, request)


@router.post("/{role_id}/toggle-permission", dependencies=[Depends(require_admin_permission(P.ROLES_UPDATE))])
def toggle_permission(role_id: int, payload: TogglePermissionSchema, request: Request,
                      db: Session = Depends(get_db)):
    return service.toggle_permission(db, role_id, payload, request)


@router.delete("/{role_id}", dependencies=[Depends(require_admin_permission(P.ROLES_DELETE))])
def destroy(role_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_role(db, role_id, request)
