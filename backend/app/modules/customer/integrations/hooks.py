"""The events other modules report, ready for webhooks. Each is cheap when no webhook listens."""
from sqlalchemy.orm import Session

from app.modules.customer.integrations.webhooks import safe_emit


def message_event(db: Session, event: str, message, contact=None) -> None:
    from app.modules.customer.integrations import data

    safe_emit(db, message.customer_id, event, lambda: data.message(message, contact))


def contact_created(db: Session, contact) -> None:
    contact_event(db, "contact.created", contact)


def contact_event(db: Session, event: str, contact) -> None:
    from app.modules.customer.integrations import data

    safe_emit(db, contact.customer_id, event, lambda: data.contact(contact))


def conversation_resolved(db: Session, conversation) -> None:
    from app.modules.customer.integrations import data

    safe_emit(db, conversation.customer_id, "conversation.resolved", lambda: data.conversation(conversation))


def order_event(db: Session, event: str, order) -> None:
    from app.modules.customer.commerce import service
    from app.modules.customer.integrations import data

    safe_emit(db, order.customer_id, event,
              lambda: data.order(order, service.settings_of(db, _owner(db, order.customer_id))))


def _owner(db: Session, number_id: int):
    from app.modules.customer.account.models import Customer

    return db.get(Customer, number_id)


def campaign_finished(db: Session, campaign) -> None:
    from app.modules.customer.integrations import data

    safe_emit(db, campaign.customer_id, "campaign.finished", lambda: data.campaign(db, campaign))
