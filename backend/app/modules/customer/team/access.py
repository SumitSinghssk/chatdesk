"""Who is acting, in whose workspace, with which role.

Every workspace endpoint depends on `require_workspace` (or `require_role(...)`). It returns the
workspace OWNER's Customer row, because all workspace data (contacts, chats, templates…) is keyed by
the owner's id, so existing queries keep working for every member. The signed-in person is attached
as `.actor` and their role as `.member_role`.
"""

from fastapi import Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer
from app.core.database import get_db
from app.modules.customer.account.models import Customer
from app.shared.enums import Status

ROLES = ("owner", "admin", "agent")
DEFAULT_SETTINGS = {
    "auto_assign": "off",  # off | round_robin
    "assign_team_id": None,  # only members of this team get new chats (None = everyone)
    "only_available": True,  # skip members who set themselves Away
    "max_open": None,  # skip members who already have this many open chats
    "agent_visibility": "all",  # agents see: all chats | assigned (theirs + unassigned + their teams') | own
}


def require_workspace(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> Customer:
    if customer.workspace_id is None:
        owner = customer
    else:
        owner = db.query(Customer).filter(Customer.id == customer.workspace_id, Customer.not_deleted()).first()
        if owner is None or owner.status != Status.ACTIVE.value:
            raise HTTPException(status_code=401, detail="This workspace isn't active any more.")
    owner.actor = customer
    owner.member_role = customer.role if customer.workspace_id else "owner"
    return owner


def require_role(*roles: str):
    """Dependency: the workspace owner (see above), if the signed-in member has one of `roles`."""

    def dependency(workspace: Customer = Depends(require_workspace)) -> Customer:
        if workspace.member_role not in roles:
            raise HTTPException(status_code=403, detail="Your role doesn't allow this. Ask an admin of your team.")
        return workspace

    return dependency


require_admin = require_role("owner", "admin")


def actor(workspace: Customer) -> Customer:
    """The signed-in person (the owner themselves, or a team member)."""
    return getattr(workspace, "actor", workspace)


def actor_name(workspace: Customer) -> str | None:
    person = actor(workspace)
    return person.name or person.email


def role_of(workspace: Customer) -> str:
    return getattr(workspace, "member_role", "owner")


def settings_of(owner: Customer) -> dict:
    return {**DEFAULT_SETTINGS, **(owner.team_settings or {})}


def visible_chats(db: Session, workspace: Customer, conversation_model):
    """SQL filter for the chats this member may see, or None for no restriction."""
    if role_of(workspace) != "agent":
        return None
    mode = settings_of(workspace)["agent_visibility"]
    if mode == "all":
        return None
    me = actor(workspace)
    mine = conversation_model.assignee_id == me.id
    if mode == "own":
        return mine
    from app.modules.customer.team.models import WaTeamMember

    my_teams = db.query(WaTeamMember.team_id).filter(WaTeamMember.member_id == me.id).subquery().select()
    return or_(
        mine,
        and_(conversation_model.assignee_id.is_(None),
             or_(conversation_model.team_id.is_(None), conversation_model.team_id.in_(my_teams))),
    )
