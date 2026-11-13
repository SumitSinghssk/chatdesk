"""Who else is in a chat right now (viewing, typing a reply, writing a note), so two people don't answer the
same customer at once. Browsers send a heartbeat every few seconds; a row older than FRESH is gone."""
from datetime import timedelta

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.inbox.models import WaPresence
from app.shared.utils.datetime import now

FRESH = timedelta(seconds=15)
FORGET = timedelta(hours=1)  # rows from closed tabs and crashed browsers
STATES = ("viewing", "reply", "note")


def beat(db: Session, customer_id: int, conversation_id: int, member_id: int, state: str) -> None:
    """Records this person's presence; "left" removes it."""
    if state == "left":
        db.query(WaPresence).filter(WaPresence.conversation_id == conversation_id,
                                    WaPresence.member_id == member_id).delete(synchronize_session=False)
        return
    moment = now()
    db.execute(insert(WaPresence)
               .values(customer_id=customer_id, conversation_id=conversation_id, member_id=member_id, state=state,
                       updated_at=moment)
               .on_conflict_do_update(constraint="uq_wa_presence_conversation_member",
                                      set_={"state": state, "updated_at": moment}))
    db.query(WaPresence).filter(WaPresence.customer_id == customer_id,
                                WaPresence.updated_at < moment - FORGET).delete(synchronize_session=False)


def others(db: Session, conversation_ids: list[int], member_id: int) -> dict[int, list[dict]]:
    """{conversation id: [{id, name, state, at}]} for other people seen in the last FRESH seconds.
    Typing comes first, then viewers."""
    if not conversation_ids:
        return {}
    rows = (db.query(WaPresence, Customer.name, Customer.email)
            .join(Customer, Customer.id == WaPresence.member_id)
            .filter(WaPresence.conversation_id.in_(conversation_ids), WaPresence.member_id != member_id,
                    WaPresence.updated_at >= now() - FRESH)
            .all())
    out: dict[int, list[dict]] = {}
    for p, name, email in rows:
        out.setdefault(p.conversation_id, []).append(
            {"id": p.member_id, "name": name or email or "A colleague", "state": p.state,
             "at": p.updated_at.isoformat() + "Z"})
    for people in out.values():
        people.sort(key=lambda x: (x["state"] == "viewing", x["name"]))
    return out
