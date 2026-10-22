from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.team_members import service
from app.modules.admin.team_members.schemas import TeamMemberCreateSchema, TeamMemberUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.bulk import BulkActionSchema, ReorderSchema

router = APIRouter(prefix="/team-members", tags=["Admin Team Members"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.TEAM_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    department: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_members(db, page, per_page, search, status.value if status else None, department,
                                filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.TEAM_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.TEAM_CREATE))])
def store(payload: TeamMemberCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_member(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.TEAM_UPDATE, P.TEAM_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.TEAM_UPDATE, P.TEAM_DELETE)
    return service.bulk_action(db, payload, request)


@router.post("/reorder", dependencies=[Depends(require_admin_permission(P.TEAM_UPDATE))])
def reorder(payload: ReorderSchema, request: Request, db: Session = Depends(get_db)):
    return service.reorder(db, payload, request)


@router.get("/{member_id}", dependencies=[Depends(require_admin_permission(P.TEAM_VIEW))])
def show(member_id: int, db: Session = Depends(get_db)):
    return service.get_member(db, member_id)


@router.put("/{member_id}", dependencies=[Depends(require_admin_permission(P.TEAM_UPDATE))])
def update(member_id: int, payload: TeamMemberUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_member(db, member_id, payload, request)


@router.patch("/{member_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.TEAM_UPDATE))])
def toggle_status(member_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, member_id, request)


@router.delete("/{member_id}", dependencies=[Depends(require_admin_permission(P.TEAM_DELETE))])
def destroy(member_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_member(db, member_id, request)
