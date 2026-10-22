from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.users import service
from app.modules.admin.users.schemas import UserCreateSchema, UserUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.bulk import BulkActionSchema

router = APIRouter(prefix="/users", tags=["Admin Users"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.USERS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    role_id: str | None = None,
    locked: bool | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_users(db, page, per_page, search, status.value if status else None,
                              (role_id or "").strip() or None, locked, filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.USERS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.USERS_CREATE))])
def store(payload: UserCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_user(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.USERS_UPDATE, P.USERS_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.USERS_UPDATE, P.USERS_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{user_id}", dependencies=[Depends(require_admin_permission(P.USERS_VIEW))])
def show(user_id: int, db: Session = Depends(get_db)):
    return service.get_user(db, user_id)


@router.put("/{user_id}", dependencies=[Depends(require_admin_permission(P.USERS_UPDATE))])
def update(user_id: int, payload: UserUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_user(db, user_id, payload, request)


@router.patch("/{user_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.USERS_UPDATE))])
def toggle_status(user_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, user_id, request)


@router.delete("/{user_id}", dependencies=[Depends(require_admin_permission(P.USERS_DELETE))])
def destroy(user_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_user(db, user_id, request)


@router.post("/{user_id}/unlock", dependencies=[Depends(require_admin_permission(P.USERS_MANAGE_SECURITY))])
def unlock(user_id: int, request: Request, db: Session = Depends(get_db)):
    return service.unlock(db, user_id, request)


@router.delete("/{user_id}/two-factor", dependencies=[Depends(require_admin_permission(P.USERS_MANAGE_SECURITY))])
def reset_two_factor(user_id: int, request: Request, db: Session = Depends(get_db)):
    return service.reset_two_factor(db, user_id, request)


@router.delete("/{user_id}/sessions", dependencies=[Depends(require_admin_permission(P.USERS_MANAGE_SECURITY))])
def revoke_all_sessions(user_id: int, request: Request, db: Session = Depends(get_db)):
    return service.revoke_all_sessions(db, user_id, request)


@router.delete(
    "/{user_id}/sessions/{session_id}",
    dependencies=[Depends(require_admin_permission(P.USERS_MANAGE_SECURITY))],
)
def revoke_session(user_id: int, session_id: str, request: Request, db: Session = Depends(get_db)):
    return service.revoke_session(db, user_id, session_id, request)
