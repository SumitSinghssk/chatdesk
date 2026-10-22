from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.team import service
from app.modules.customer.team.access import require_admin, require_workspace
from app.modules.customer.team.schemas import (
    AcceptInviteSchema,
    AvailabilitySchema,
    InviteSchema,
    MemberUpdateSchema,
    SettingsSchema,
    TeamSchema,
)

router = APIRouter(prefix="/team", tags=["Customer Team"])
public_router = APIRouter(prefix="/team", tags=["Customer Team"])
_csrf = Depends(require_customer_csrf)


# Everyone in the workspace (the inbox needs members and teams to assign chats) ----------

@router.get("/members")
def members(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_members(db, ws)


@router.get("/teams")
def teams(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_teams(db, ws)


@router.put("/availability", dependencies=[_csrf])
def availability(payload: AvailabilitySchema, ws: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return service.set_availability(db, ws, payload)


# Owners and admins ----------------------------------------------------------------------

@router.post("/members", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def invite(payload: InviteSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.invite(db, ws, payload)


@router.post("/members/{member_id}/invite", dependencies=[_csrf])
def reinvite(member_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.reinvite(db, ws, member_id)


@router.put("/members/{member_id}", dependencies=[_csrf])
def update_member(member_id: int, payload: MemberUpdateSchema, ws: Customer = Depends(require_admin),
                  db: Session = Depends(get_db)):
    return service.update_member(db, ws, member_id, payload)


@router.delete("/members/{member_id}", dependencies=[_csrf])
def remove_member(member_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.remove_member(db, ws, member_id)


@router.post("/teams", dependencies=[_csrf])
def create_team(payload: TeamSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_team(db, ws, payload)


@router.put("/teams/{team_id}", dependencies=[_csrf])
def update_team(team_id: int, payload: TeamSchema, ws: Customer = Depends(require_admin),
                db: Session = Depends(get_db)):
    return service.update_team(db, ws, team_id, payload)


@router.delete("/teams/{team_id}", dependencies=[_csrf])
def delete_team(team_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_team(db, ws, team_id)


@router.get("/settings")
def get_settings(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_settings(db, ws)


@router.put("/settings", dependencies=[_csrf])
def save_settings(payload: SettingsSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save_settings(db, ws, payload)


@router.get("/performance")
def performance(days: int = Query(7, ge=1, le=365), ws: Customer = Depends(require_admin),
                db: Session = Depends(get_db)):
    return service.performance(db, ws, days)


# Invite links (the invited person isn't signed in yet) ---------------------------------

@public_router.get("/invites/{token}", dependencies=[Depends(RateLimit(30, 60))])
def get_invite(token: str, db: Session = Depends(get_db)):
    return service.get_invite(db, token)


@public_router.post("/invites/{token}/accept", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def accept_invite(token: str, payload: AcceptInviteSchema, request: Request, response: Response,
                  db: Session = Depends(get_db)):
    return service.accept_invite(db, token, payload, request, response)
