"""Assigning chats (by hand and round-robin), the chat timeline, and response times."""

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import WaConversation, WaConversationEvent, WaResponse
from app.modules.customer.team.access import settings_of
from app.modules.customer.team.models import WaTeam, WaTeamMember
from app.shared.enums import Status
from app.shared.utils.datetime import now

OPEN = ("open", "pending")


def members(db: Session, owner_id: int):
    """Everyone in the workspace who can be assigned chats (the owner included), active only."""
    return db.query(Customer).filter(
        (Customer.id == owner_id) | (Customer.workspace_id == owner_id),
        Customer.not_deleted(), Customer.status == Status.ACTIVE.value)


def member_of(db: Session, owner_id: int, member_id: int) -> Customer | None:
    return members(db, owner_id).filter(Customer.id == member_id).first()


def display(person: Customer | None) -> str:
    return (person.name or person.email or "Someone") if person else "nobody"


def event(db: Session, conversation: WaConversation, kind: str, text: str, actor: str | None) -> None:
    db.add(WaConversationEvent(conversation_id=conversation.id, kind=kind, text=text[:255], actor=actor,
                               created_at=now()))


def assign(db: Session, owner: Customer, conversation: WaConversation, assignee_id: int | None,
           team_id: int | None, actor: str | None) -> None:
    """Sets who handles the chat and/or its team, and writes it to the timeline."""
    team = None
    if team_id is not None:
        team = db.query(WaTeam).filter(WaTeam.id == team_id, WaTeam.customer_id == owner.id).first()
        if team is None:
            raise HTTPException(422, detail="That team doesn't exist")
    person = None
    if assignee_id is not None:
        person = member_of(db, owner.id, assignee_id)
        if person is None:
            raise HTTPException(422, detail="That person isn't an active member of your team")
    if team_id != conversation.team_id:
        conversation.team_id = team_id
        event(db, conversation, "team", f"Moved to team {team.name}" if team else "Removed from its team", actor)
    if assignee_id != conversation.assignee_id:
        conversation.assignee_id = assignee_id
        conversation.assigned_at = now() if assignee_id else None
        if person is not None:
            person.last_assigned_at = now()
            event(db, conversation, "assigned", f"Assigned to {display(person)}", actor)
        else:
            event(db, conversation, "unassigned", "Unassigned", actor)


def pick_round_robin(db: Session, owner: Customer) -> Customer | None:
    """The next member for a new chat: longest since their last assignment, within the rules."""
    rules = settings_of(owner)
    q = members(db, owner.id)
    if rules.get("assign_team_id"):
        q = q.filter(Customer.id.in_(db.query(WaTeamMember.member_id)
                                     .filter(WaTeamMember.team_id == rules["assign_team_id"])))
    if rules.get("only_available", True):
        q = q.filter(Customer.availability == "available")
    candidates = q.order_by(Customer.last_assigned_at.asc().nulls_first(), Customer.id).all()
    limit = rules.get("max_open")
    for person in candidates:
        if limit:
            open_now = db.query(func.count(WaConversation.id)).filter(
                WaConversation.assignee_id == person.id, WaConversation.status.in_(OPEN)).scalar() or 0
            if open_now >= int(limit):
                continue
        return person
    return None


def auto_assign(db: Session, owner_id: int, conversation: WaConversation) -> Customer | None:
    """Gives an unassigned chat to the next member, if the workspace turned round-robin on."""
    if conversation.assignee_id is not None:
        return None
    owner = db.get(Customer, owner_id)
    if owner is None or settings_of(owner)["auto_assign"] != "round_robin":
        return None
    person = pick_round_robin(db, owner)
    if person is None:
        return None
    team_id = settings_of(owner).get("assign_team_id")
    if team_id and conversation.team_id is None:
        conversation.team_id = team_id
    conversation.assignee_id = person.id
    conversation.assigned_at = now()
    person.last_assigned_at = now()
    event(db, conversation, "assigned", f"Auto-assigned to {display(person)}", None)
    return person


def record_response(db: Session, conversation: WaConversation, member: Customer | None) -> None:
    """A member answered: store how long the customer waited, and stop the clock."""
    if conversation.waiting_since is None:
        return
    seconds = max(0, int((now() - conversation.waiting_since).total_seconds()))
    db.add(WaResponse(customer_id=conversation.customer_id, conversation_id=conversation.id,
                      member_id=member.id if member else None, seconds=seconds, created_at=now()))
    conversation.waiting_since = None
