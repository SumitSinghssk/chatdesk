from datetime import timedelta

from fastapi import HTTPException, Request, Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.customer_auth import start_session
from app.core.security import hash_password, random_token, sha256
from app.modules.customer.account.models import Customer, CustomerSession
from app.modules.customer.account.serializers import serialize_customer
from app.modules.customer.auth.service import check_password, field_error
from app.modules.customer.inbox.models import WaConversation, WaMessage, WaResponse
from app.modules.customer.team import assign as assigning
from app.modules.customer.team.access import actor, actor_name, settings_of
from app.modules.customer.team.models import WaTeam, WaTeamMember
from app.modules.customer.team.schemas import (
    AcceptInviteSchema,
    AvailabilitySchema,
    InviteSchema,
    MemberUpdateSchema,
    SettingsSchema,
    TeamSchema,
)
from app.shared.enums import Status
from app.shared.utils.datetime import iso, now

INVITED = "invited"
INVITE_DAYS = 7


def invite_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/invite/{token}"


def _people(db: Session, owner_id: int):
    """The owner plus every member (invited or active) of the workspace."""
    return db.query(Customer).filter((Customer.id == owner_id) | (Customer.workspace_id == owner_id),
                                     Customer.not_deleted())


def _teams_by_member(db: Session, owner_id: int) -> dict[int, list[dict]]:
    rows = (db.query(WaTeamMember.member_id, WaTeam.id, WaTeam.name).join(WaTeam)
            .filter(WaTeam.customer_id == owner_id).order_by(WaTeam.name).all())
    out: dict[int, list[dict]] = {}
    for member_id, team_id, name in rows:
        out.setdefault(member_id, []).append({"id": team_id, "name": name})
    return out


def serialize_member(m: Customer, owner_id: int, me_id: int, teams: dict, open_chats: dict) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "email": m.email,
        "phone": m.phone,
        "role": "owner" if m.id == owner_id else m.role,
        "status": INVITED if m.status == INVITED else "active" if m.status == Status.ACTIVE.value else m.status,
        "availability": m.availability,
        "teams": teams.get(m.id, []),
        "open_chats": open_chats.get(m.id, 0),
        "last_login_at": iso(m.last_login_at),
        "invited_by": m.invited_by,
        "invite_expires_at": iso(m.invite_expires_at),
        "is_you": m.id == me_id,
        "created_at": iso(m.created_at),
    }


def _open_chats(db: Session, owner_id: int) -> dict[int, int]:
    return dict(db.query(WaConversation.assignee_id, func.count(WaConversation.id))
                .filter(WaConversation.customer_id == owner_id, WaConversation.assignee_id.isnot(None),
                        WaConversation.status.in_(assigning.OPEN))
                .group_by(WaConversation.assignee_id).all())


def list_members(db: Session, ws: Customer) -> dict:
    people = _people(db, ws.id).order_by(case((Customer.id == ws.id, 0), else_=1), Customer.name).all()
    teams, open_chats = _teams_by_member(db, ws.id), _open_chats(db, ws.id)
    return {"status": True, "data": [serialize_member(m, ws.id, actor(ws).id, teams, open_chats) for m in people]}


def _member(db: Session, ws: Customer, member_id: int) -> Customer:
    m = _people(db, ws.id).filter(Customer.id == member_id).first()
    if m is None:
        raise HTTPException(404, detail="Member not found")
    return m


def _set_teams(db: Session, ws: Customer, member: Customer, team_ids: list[int]) -> None:
    valid = {t for (t,) in db.query(WaTeam.id).filter(WaTeam.customer_id == ws.id, WaTeam.id.in_(team_ids or [0]))}
    db.query(WaTeamMember).filter(WaTeamMember.member_id == member.id,
                                  WaTeamMember.team_id.notin_(valid or {0})).delete(synchronize_session=False)
    have = {t for (t,) in db.query(WaTeamMember.team_id).filter(WaTeamMember.member_id == member.id)}
    for team_id in valid - have:
        db.add(WaTeamMember(team_id=team_id, member_id=member.id))


def _one(db: Session, ws: Customer, member: Customer, extra: dict | None = None) -> dict:
    data = serialize_member(member, ws.id, actor(ws).id, _teams_by_member(db, ws.id), _open_chats(db, ws.id))
    return {**data, **(extra or {})}


def invite(db: Session, ws: Customer, payload: InviteSchema) -> dict:
    email = str(payload.email).lower()
    existing = db.query(Customer).filter(func.lower(Customer.email) == email, Customer.not_deleted()).first()
    if existing is not None:
        if existing.id == ws.id or existing.workspace_id == ws.id:
            raise field_error(409, "email", "This person is already in your team")
        raise field_error(409, "email", "This email already has its own ChatDesk account. Invite another email.")
    token = random_token(32)
    member = Customer(email=email, name=payload.name, workspace_id=ws.id, role=payload.role, status=INVITED,
                      signup_method="invite", invite_token_hash=sha256(token),
                      invite_expires_at=now() + timedelta(days=INVITE_DAYS), invited_by=actor_name(ws))
    db.add(member)
    db.flush()
    _set_teams(db, ws, member, payload.team_ids)
    db.commit()
    return {"status": True, "message": f"Invite ready for {email}. Share the link with them.",
            "data": _one(db, ws, member, {"invite_url": invite_url(token)})}


def reinvite(db: Session, ws: Customer, member_id: int) -> dict:
    member = _member(db, ws, member_id)
    if member.status != INVITED:
        raise HTTPException(422, detail="This person already joined")
    token = random_token(32)
    member.invite_token_hash = sha256(token)
    member.invite_expires_at = now() + timedelta(days=INVITE_DAYS)
    member.invited_by = actor_name(ws)
    db.commit()
    return {"status": True, "message": "New invite link created. The old one no longer works.",
            "data": _one(db, ws, member, {"invite_url": invite_url(token)})}


def update_member(db: Session, ws: Customer, member_id: int, payload: MemberUpdateSchema) -> dict:
    member = _member(db, ws, member_id)
    if member.id == ws.id:
        raise HTTPException(422, detail="The owner's role can't be changed")
    if member.id == actor(ws).id and payload.role != member.role:
        raise HTTPException(422, detail="You can't change your own role")
    member.role = payload.role
    _set_teams(db, ws, member, payload.team_ids)
    db.commit()
    return {"status": True, "message": "Member updated", "data": _one(db, ws, member)}


def remove_member(db: Session, ws: Customer, member_id: int) -> dict:
    member = _member(db, ws, member_id)
    if member.id == ws.id:
        raise HTTPException(422, detail="The owner can't be removed")
    if member.id == actor(ws).id:
        raise HTTPException(422, detail="You can't remove yourself. Ask another admin.")
    chats = db.query(WaConversation).filter(WaConversation.customer_id == ws.id,
                                            WaConversation.assignee_id == member.id).all()
    for conversation in chats:
        assigning.assign(db, ws, conversation, None, conversation.team_id, actor_name(ws))
    db.query(WaTeamMember).filter(WaTeamMember.member_id == member.id).delete(synchronize_session=False)
    if member.status == INVITED:
        db.delete(member)
    else:
        member.deleted_at = now()
        member.status = Status.INACTIVE.value
        db.query(CustomerSession).filter(CustomerSession.customer_id == member.id,
                                         CustomerSession.revoked_at.is_(None)).update({"revoked_at": now()})
    db.commit()
    moved = f" Their {len(chats)} chat{'s are' if len(chats) != 1 else ' is'} now unassigned." if chats else ""
    return {"status": True, "message": f"{assigning.display(member)} was removed.{moved}", "data": None}


def set_availability(db: Session, ws: Customer, payload: AvailabilitySchema) -> dict:
    me = actor(ws)
    me.availability = payload.availability
    db.commit()
    text = "You're available for new chats" if payload.availability == "available" else \
        "You're away: new chats go to others"
    return {"status": True, "message": text, "data": {"availability": me.availability}}


# Teams --------------------------------------------------------------------------------

def _team(db: Session, ws: Customer, team_id: int) -> WaTeam:
    team = db.query(WaTeam).filter(WaTeam.id == team_id, WaTeam.customer_id == ws.id).first()
    if team is None:
        raise HTTPException(404, detail="Team not found")
    return team


def _serialize_team(db: Session, team: WaTeam) -> dict:
    ids = [m.member_id for m in team.members]
    open_chats = db.query(func.count(WaConversation.id)).filter(
        WaConversation.team_id == team.id, WaConversation.status.in_(assigning.OPEN)).scalar() or 0
    return {"id": team.id, "name": team.name, "description": team.description, "member_ids": ids,
            "open_chats": open_chats, "created_at": iso(team.created_at)}


def list_teams(db: Session, ws: Customer) -> dict:
    teams = db.query(WaTeam).filter(WaTeam.customer_id == ws.id).order_by(WaTeam.name).all()
    return {"status": True, "data": [_serialize_team(db, t) for t in teams]}


def _save_team(db: Session, ws: Customer, team: WaTeam, payload: TeamSchema) -> None:
    clash = db.query(WaTeam.id).filter(WaTeam.customer_id == ws.id, func.lower(WaTeam.name) == payload.name.lower())
    if team.id:
        clash = clash.filter(WaTeam.id != team.id)
    if clash.first():
        raise field_error(409, "name", "A team with this name already exists")
    team.name, team.description = payload.name, payload.description
    valid = {m.id for m in _people(db, ws.id).filter(Customer.id.in_(payload.member_ids or [0]))}
    db.flush()
    db.query(WaTeamMember).filter(WaTeamMember.team_id == team.id).delete(synchronize_session=False)
    for member_id in valid:
        db.add(WaTeamMember(team_id=team.id, member_id=member_id))


def create_team(db: Session, ws: Customer, payload: TeamSchema) -> dict:
    team = WaTeam(customer_id=ws.id)
    db.add(team)
    _save_team(db, ws, team, payload)
    db.commit()
    db.refresh(team)
    return {"status": True, "message": "Team created", "data": _serialize_team(db, team)}


def update_team(db: Session, ws: Customer, team_id: int, payload: TeamSchema) -> dict:
    team = _team(db, ws, team_id)
    _save_team(db, ws, team, payload)
    db.commit()
    db.refresh(team)
    return {"status": True, "message": "Team saved", "data": _serialize_team(db, team)}


def delete_team(db: Session, ws: Customer, team_id: int) -> dict:
    team = _team(db, ws, team_id)
    rules = dict(ws.team_settings or {})
    if rules.get("assign_team_id") == team.id:
        rules["assign_team_id"] = None
        ws.team_settings = rules
    db.delete(team)
    db.commit()
    return {"status": True, "message": "Team deleted. Its chats keep their assignee.", "data": None}


# Rules --------------------------------------------------------------------------------

def get_settings(db: Session, ws: Customer) -> dict:
    return {"status": True, "data": settings_of(ws)}


def save_settings(db: Session, ws: Customer, payload: SettingsSchema) -> dict:
    data = payload.model_dump()
    if data["assign_team_id"] is not None:
        _team(db, ws, data["assign_team_id"])
    ws.team_settings = data
    db.commit()
    return {"status": True, "message": "Assignment rules saved", "data": settings_of(ws)}


# Performance --------------------------------------------------------------------------

def performance(db: Session, ws: Customer, days: int) -> dict:
    since = now() - timedelta(days=days)
    people = _people(db, ws.id).filter(Customer.status == Status.ACTIVE.value).all()
    open_chats = _open_chats(db, ws.id)
    resolved = dict(db.query(WaConversation.assignee_id, func.count(WaConversation.id))
                    .filter(WaConversation.customer_id == ws.id, WaConversation.status == "resolved",
                            WaConversation.resolved_at >= since, WaConversation.assignee_id.isnot(None))
                    .group_by(WaConversation.assignee_id).all())
    replies = dict(db.query(WaMessage.member_id, func.count(WaMessage.id))
                   .filter(WaMessage.customer_id == ws.id, WaMessage.direction == "out",
                           WaMessage.created_at >= since, WaMessage.member_id.isnot(None))
                   .group_by(WaMessage.member_id).all())
    response_rows = (db.query(WaResponse.member_id, func.count(WaResponse.id), func.avg(WaResponse.seconds),
                              func.sum(case((WaResponse.seconds <= 300, 1), else_=0)))
                     .filter(WaResponse.customer_id == ws.id, WaResponse.created_at >= since)
                     .group_by(WaResponse.member_id).all())
    responses = {m: (n, avg, fast) for m, n, avg, fast in response_rows}
    rows = []
    for p in people:
        n, avg, fast = responses.get(p.id, (0, None, 0))
        rows.append({
            "member": {"id": p.id, "name": p.name or p.email, "role": "owner" if p.id == ws.id else p.role,
                       "availability": p.availability},
            "open_chats": open_chats.get(p.id, 0),
            "resolved": resolved.get(p.id, 0),
            "replies": replies.get(p.id, 0),
            "responses": n,
            "avg_response_seconds": round(float(avg)) if avg is not None else None,
            "within_5_min": round(100 * int(fast or 0) / n) if n else None,
        })
    total_n = sum(r["responses"] for r in rows)
    total_avg = (sum((r["avg_response_seconds"] or 0) * r["responses"] for r in rows) / total_n) if total_n else None
    waiting = db.query(func.count(WaConversation.id)).filter(
        WaConversation.customer_id == ws.id, WaConversation.waiting_since.isnot(None),
        WaConversation.status.in_(assigning.OPEN)).scalar() or 0
    unassigned = db.query(func.count(WaConversation.id)).filter(
        WaConversation.customer_id == ws.id, WaConversation.assignee_id.is_(None),
        WaConversation.status.in_(assigning.OPEN)).scalar() or 0
    return {"status": True, "data": {
        "days": days, "members": rows,
        "totals": {"avg_response_seconds": round(total_avg) if total_avg is not None else None,
                   "responses": total_n, "waiting_now": waiting, "unassigned_open": unassigned,
                   "resolved": sum(r["resolved"] for r in rows), "replies": sum(r["replies"] for r in rows)},
    }}


# Invites (public: the invited person isn't signed in) ----------------------------------

def _invited(db: Session, token: str) -> Customer:
    member = db.query(Customer).filter(Customer.invite_token_hash == sha256(token), Customer.status == INVITED,
                                       Customer.not_deleted()).first()
    if member is None or (member.invite_expires_at and member.invite_expires_at < now()):
        raise HTTPException(404, detail="This invite link is invalid or has expired. Ask for a new one.")
    return member


def get_invite(db: Session, token: str) -> dict:
    member = _invited(db, token)
    owner = db.get(Customer, member.workspace_id)
    return {"status": True, "data": {
        "email": member.email, "name": member.name, "role": member.role, "invited_by": member.invited_by,
        "workspace": (owner.business_name or owner.name) if owner else None,
    }}


def accept_invite(db: Session, token: str, payload: AcceptInviteSchema, request: Request,
                  response: Response) -> dict:
    member = _invited(db, token)
    check_password(db, payload.password)
    member.name = payload.name.strip()
    member.password = hash_password(payload.password)
    member.status = Status.ACTIVE.value
    member.email_verified_at = now()  # they opened the link sent to them
    member.invite_token_hash = None
    member.invite_expires_at = None
    start_session(db, member, request, response, "invite")
    db.commit()
    return {"status": True, "message": "Welcome to the team!", "data": {"customer": serialize_customer(member)}}

