"""Notifications for people in a workspace: the bell in the header, emails and desktop pop-ups.

`notify()` is called where things happen (a chat assigned, a campaign finished, the AI agent handing
over, a WhatsApp number problem); `waiting_alerts()` runs every minute for customers left waiting.
Each person's settings (account/settings.py) decide which channels they get.
"""

import logging
import os
import threading
import time
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.modules.customer.account.models import Customer, CustomerNotification
from app.modules.customer.account.settings import channels_for, is_manager, notification_settings
from app.shared.enums import Status
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)


def team(db: Session, owner_id: int) -> list[Customer]:
    """Everyone active who works on this number (the owner first)."""
    from app.modules.customer.team.access import people

    return people(db, owner_id).order_by(Customer.workspace_id.is_not(None), Customer.id).all()


def managers(db: Session, owner_id: int) -> list[Customer]:
    return [p for p in team(db, owner_id) if is_manager(p)]


def for_chat(db: Session, owner_id: int, assignee_id: int | None) -> list[Customer]:
    """Who hears about a chat: the person it's assigned to, otherwise the owners and admins."""
    if assignee_id:
        person = db.get(Customer, assignee_id)
        if person is not None and person.deleted_at is None and person.status == Status.ACTIVE.value:
            return [person]
    return managers(db, owner_id)


def _email(person_id: int, title: str, body: str | None, url: str | None) -> None:
    from app.core.config import settings
    from app.core.mailer import mail_enabled, send_mail

    db = SessionLocal()
    try:
        person = db.get(Customer, person_id)
        if person is None or not person.email or not mail_enabled(db):
            return
        link = f"{settings.FRONTEND_URL.rstrip('/')}{url}" if url else None
        send_mail(db, person.email, title, title, f"<p>{body or ''}</p>", ("Open ChatDesk", link) if link else None)
    except Exception:  # noqa: BLE001 - an email never breaks what triggered it
        logger.exception("Notification email to customer %s failed", person_id)
    finally:
        db.close()


def notify(db: Session, people: list[Customer], event: str, title: str, body: str | None = None,
           url: str | None = None, data: dict | None = None, once_key: str | None = None,
           skip: int | None = None, number_id: int | None = None) -> int:
    """Notifies each person through the channels they chose. `once_key` makes it happen only once per
    person (e.g. one alert per waiting chat). `skip`: the person who caused it. `number_id`: the
    WhatsApp number it happened on; with several numbers the title names it and the link switches to it.
    Returns how many got it. Adds to the caller's transaction; the caller commits."""
    if number_id is not None:
        title, url = _on_number(db, number_id, title, url)
    sent = 0
    emails = []
    for person in people:
        if skip is not None and person.id == skip:
            continue
        ch = channels_for(person, event)
        if not (ch["in_app"] or ch["email"] or ch["browser"]):
            continue
        if once_key and db.query(CustomerNotification.id).filter(
                CustomerNotification.customer_id == person.id, CustomerNotification.event == event,
                CustomerNotification.data["key"].as_string() == once_key).first():
            continue
        # the bell list also keeps what was emailed or popped up, so nothing is lost
        db.add(CustomerNotification(customer_id=person.id, event=event, title=title[:200],
                                    body=(body or "")[:500] or None, url=url, browser=ch["browser"],
                                    data={**(data or {}), **({"key": once_key} if once_key else {})},
                                    created_at=now()))
        if ch["email"]:
            emails.append(person.id)
        sent += 1
    db.flush()
    for person_id in emails:
        if os.getenv("NOTIFY_EMAIL_INLINE") == "1":
            _email(person_id, title, body, url)
        else:
            threading.Thread(target=_email, args=(person_id, title, body, url), daemon=True).start()
    return sent


def _on_number(db: Session, number_id: int, title: str, url: str | None) -> tuple[str, str | None]:
    number = db.get(Customer, number_id)
    if number is None:
        return title, url
    main_id = number.parent_id or number.id
    several = db.query(Customer.id).filter(Customer.parent_id == main_id, Customer.not_deleted()).first()
    if not several:
        return title, url
    from app.modules.customer.numbers.service import label_of

    if url:
        url = f"{url}{'&' if '?' in url else '?'}number={number.id}"
    return f"{label_of(number)} · {title}", url


# Events ------------------------------------------------------------------------------------------

def chat_assigned(db: Session, owner_id: int, conversation, person: Customer, actor_id: int | None) -> None:
    contact = conversation.contact
    who = contact.name or contact.profile_name or f"+{contact.wa_id}"
    notify(db, [person], "chat_assigned", f"New chat assigned to you: {who}",
           conversation.last_message_preview, f"/dashboard/inbox?c={conversation.id}",
           {"conversation_id": conversation.id}, skip=actor_id, number_id=owner_id)


def ai_handover(db: Session, owner_id: int, conversation, reason: str) -> None:
    contact = conversation.contact
    who = contact.name or contact.profile_name or f"+{contact.wa_id}"
    notify(db, for_chat(db, owner_id, conversation.assignee_id), "ai_handover",
           f"The AI agent handed {who} to your team", reason, f"/dashboard/inbox?c={conversation.id}",
           {"conversation_id": conversation.id}, number_id=owner_id)


def campaign_finished(db: Session, campaign) -> None:
    title = f"Campaign “{campaign.name}” finished" if campaign.status == "completed" \
        else f"Campaign “{campaign.name}” stopped"
    body = (f"Sent to {campaign.total or 0} people." if campaign.status == "completed"
            else (campaign.error or "It couldn't finish."))
    from app.modules.customer.integrations import hooks

    hooks.campaign_finished(db, campaign)
    notify(db, managers(db, campaign.customer_id), "campaign_finished", title, body,
           f"/dashboard/campaigns/{campaign.id}", {"campaign_id": campaign.id},
           once_key=f"campaign:{campaign.id}:{campaign.status}", number_id=campaign.customer_id)


def new_order(db: Session, order, who: str) -> None:
    from app.modules.customer.commerce.orders import order_ref, total_text
    from app.modules.customer.integrations import hooks

    hooks.order_event(db, "order.created", order)
    notify(db, managers(db, order.customer_id), "new_order", f"New order {order_ref(order)} from {who}",
           f"{len(order.items)} item{'' if len(order.items) == 1 else 's'} · {total_text(order)}",
           f"/dashboard/commerce/orders/{order.id}", {"order_id": order.id}, once_key=f"order:{order.id}",
           number_id=order.customer_id)


def payment_received(db: Session, order, amount: str) -> None:
    from app.modules.customer.commerce.orders import order_ref
    from app.modules.customer.integrations import hooks

    hooks.order_event(db, "order.paid", order)
    who = order.customer_name or order.customer_phone or "a customer"
    notify(db, managers(db, order.customer_id), "payment_received", f"{amount} paid for order {order_ref(order)}",
           f"From {who}", f"/dashboard/commerce/orders/{order.id}", {"order_id": order.id},
           once_key=f"paid:{order.id}:{order.paid_at:%Y%m%d%H%M%S}" if order.paid_at else None,
           number_id=order.customer_id)


def whatsapp_problem(db: Session, owner_id: int, problem: str) -> None:
    """At most once a day: the number can't send (expired token, account blocked...)."""
    notify(db, managers(db, owner_id), "whatsapp_problem", "Your WhatsApp number has a problem", problem[:400],
           "/dashboard/whatsapp", once_key=f"whatsapp:{owner_id}:{now():%Y-%m-%d}", number_id=owner_id)


def waiting_alerts(db: Session) -> int:
    """Customers who have waited longer than each person's limit without a reply."""
    from app.modules.customer.inbox.models import WaConversation

    oldest = now() - timedelta(minutes=1)
    rows = (db.query(WaConversation).filter(WaConversation.waiting_since.is_not(None),
                                            WaConversation.waiting_since <= oldest,
                                            WaConversation.status != "resolved",
                                            WaConversation.waiting_since >= now() - timedelta(days=2))
            .order_by(WaConversation.waiting_since).limit(500).all())
    alerted = 0
    for conversation in rows:
        waited = now() - conversation.waiting_since
        people = [p for p in for_chat(db, conversation.customer_id, conversation.assignee_id)
                  if waited >= timedelta(minutes=notification_settings(p)["waiting_minutes"])]
        if not people:
            continue
        contact = conversation.contact
        who = contact.name or contact.profile_name or f"+{contact.wa_id}"
        minutes = int(waited.total_seconds() // 60)
        alerted += notify(db, people, "customer_waiting", f"{who} has been waiting {minutes} min for a reply",
                          conversation.last_message_preview, f"/dashboard/inbox?c={conversation.id}",
                          {"conversation_id": conversation.id},
                          once_key=f"wait:{conversation.id}:{conversation.waiting_since.isoformat()}",
                          number_id=conversation.customer_id)
    db.commit()
    return alerted


# In-API ticker (the scheduler's `notifications` job does the same) ------------------------------

_ticker: threading.Thread | None = None


def _tick() -> None:
    while True:
        time.sleep(60)
        db = SessionLocal()
        try:
            waiting_alerts(db)
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Waiting alerts failed")
        try:
            from app.modules.customer.diagrams.service import task_reminders

            task_reminders(db)
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Diagram task reminders failed")
        finally:
            db.close()


def start_ticker() -> None:
    global _ticker
    if os.getenv("NOTIFY_WORKER", "on").lower() in ("off", "0", "false"):
        return
    if _ticker is None or not _ticker.is_alive():
        _ticker = threading.Thread(target=_tick, name="notify-ticker", daemon=True)
        _ticker.start()
