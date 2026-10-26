"""Who is acting, in whose workspace, with which role.

Every workspace endpoint depends on `require_workspace` (or `require_role(...)`). It returns the
workspace OWNER's Customer row, because all workspace data (contacts, chats, templates…) is keyed by
the owner's id, so existing queries keep working for every member. The signed-in person is attached
as `.actor` and their role as `.member_role`.

A workspace can have several WhatsApp numbers. The first is the owner's own row; each one added later
is a row of its own (parent_id = the owner) holding that number's chats, contacts, templates and so on,
so the same queries scope everything to the number picked in the switcher (the `cd_number` cookie).
What the numbers share (the team, teams, assignment rules) lives on the main row: see `as_main`.
"""

from fastapi import Depends, HTTPException, Request
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


NUMBER_COOKIE = "cd_number"  # the WhatsApp number this browser is working on (see numbers/)


def root(owner: Customer) -> Customer:
    """The main account behind a number (itself for the first number)."""
    return owner.parent if owner.parent_id else owner


def root_id(owner: Customer) -> int:
    return owner.parent_id or owner.id


def numbers(db: Session, main: Customer) -> list[Customer]:
    """Every number of the workspace: the main account first, then the ones added later."""
    extra = (db.query(Customer).filter(Customer.parent_id == main.id, Customer.not_deleted())
             .order_by(Customer.id).all())
    return [main, *extra]


def _numbers_of(db: Session, person: Customer, main: Customer) -> list[Customer]:
    """The numbers this person may work on."""
    every = numbers(db, main)
    if person.workspace_id is None or person.role == "owner" or person.all_numbers:
        return every
    from app.modules.customer.team.models import WaNumberAccess

    mine = {n for (n,) in db.query(WaNumberAccess.number_id).filter(WaNumberAccess.member_id == person.id)}
    return [n for n in every if n.id in mine]


def require_workspace(request: Request, customer: Customer = Depends(require_customer),
                      db: Session = Depends(get_db)) -> Customer:
    if customer.workspace_id is None:
        main = customer
    else:
        main = db.query(Customer).filter(Customer.id == customer.workspace_id, Customer.not_deleted()).first()
        if main is None or main.status != Status.ACTIVE.value:
            raise HTTPException(status_code=401, detail="This workspace isn't active any more.")
    # the number picked in the switcher, or the first one this person may use
    allowed = _numbers_of(db, customer, main)
    if not allowed:
        raise HTTPException(status_code=403, detail="You haven't been given any WhatsApp number to work on yet. "
                                                    "Ask an admin of your team.")
    picked = request.cookies.get(NUMBER_COOKIE)
    owner = next((n for n in allowed if picked and str(n.id) == picked), allowed[0])
    owner.actor = customer
    owner.member_role = customer.role if customer.workspace_id else "owner"
    owner.numbers = allowed
    return owner


def as_main(workspace: Customer) -> Customer:
    """The main account, carrying who is acting, for what the numbers share (team, teams, rules)."""
    main = root(workspace)
    if main is not workspace:
        main.actor = actor(workspace)
        main.member_role = role_of(workspace)
        main.numbers = getattr(workspace, "numbers", None)
    return main


def people(db: Session, number_id: int):
    """Everyone active who works on this number (the owner included)."""
    from app.modules.customer.team.models import WaNumberAccess

    number = db.get(Customer, number_id)
    main_id = (number.parent_id or number.id) if number else number_id
    allowed = (Customer.workspace_id.is_(None) | (Customer.role == "owner") | Customer.all_numbers
               | Customer.id.in_(db.query(WaNumberAccess.member_id).filter(WaNumberAccess.number_id == number_id)))
    return db.query(Customer).filter((Customer.id == main_id) | (Customer.workspace_id == main_id), allowed,
                                     Customer.not_deleted(), Customer.status == Status.ACTIVE.value)


def require_role(*roles: str):
    """Dependency: the workspace owner (see above), if the signed-in member has one of `roles`."""

    def dependency(workspace: Customer = Depends(require_workspace)) -> Customer:
        if workspace.member_role not in roles:
            raise HTTPException(status_code=403, detail="Your role doesn't allow this. Ask an admin of your team.")
        return workspace

    return dependency


require_admin = require_role("owner", "admin")


def require_main_admin(workspace: Customer = Depends(require_admin)) -> Customer:
    return as_main(workspace)


def actor(workspace: Customer) -> Customer:
    """The signed-in person (the owner themselves, or a team member)."""
    return getattr(workspace, "actor", workspace)


def actor_name(workspace: Customer) -> str | None:
    person = actor(workspace)
    return person.name or person.email


def role_of(workspace: Customer) -> str:
    return getattr(workspace, "member_role", "owner")


def settings_of(owner: Customer) -> dict:
    return {**DEFAULT_SETTINGS, **(root(owner).team_settings or {})}  # one set of rules for every number


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
