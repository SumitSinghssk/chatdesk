import secrets

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage
from app.modules.customer.whatsapp.models import WhatsAppAccount, WhatsAppWebhookEvent
from app.modules.customer.whatsapp.schemas import ConnectionSchema, TestMessageSchema
from app.services.whatsapp import GRAPH_API_VERSION, WhatsAppClient, WhatsAppError
from app.shared.utils.datetime import iso, now


def webhook_url(account: WhatsAppAccount) -> str:
    return f"{settings.APP_URL.rstrip('/')}/api/v1/website/whatsapp/webhook/{account.webhook_key}"


def _account(db: Session, customer: Customer) -> WhatsAppAccount | None:
    return db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()


def _serialize(account: WhatsAppAccount | None) -> dict | None:
    if account is None:
        return None
    return {
        "waba_id": account.waba_id,
        "phone_number_id": account.phone_number_id,
        "has_access_token": bool(account.access_token),
        "has_app_secret": bool(account.app_secret),
        "verify_token": account.verify_token,
        "webhook_url": webhook_url(account),
        "display_phone_number": account.display_phone_number,
        "verified_name": account.verified_name,
        "quality_rating": account.quality_rating,
        "messaging_limit_tier": account.messaging_limit_tier,
        "status": account.status,
        "last_error": account.last_error,
        "webhook_verified_at": iso(account.webhook_verified_at),
        "last_event_at": iso(account.last_event_at),
        "graph_api_version": GRAPH_API_VERSION,
        "updated_at": iso(account.updated_at),
    }


def _refresh_number(account: WhatsAppAccount) -> None:
    """Asks Meta for the number's details. Marks the account connected or errored."""
    try:
        info = WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "").phone_number()
    except WhatsAppError as exc:
        account.status = "error"
        account.last_error = str(exc)
        return
    account.display_phone_number = info.get("display_phone_number")
    account.verified_name = info.get("verified_name")
    account.quality_rating = info.get("quality_rating")
    account.messaging_limit_tier = info.get("messaging_limit_tier")
    account.status = "connected"
    account.last_error = None


def get_connection(db: Session, customer: Customer) -> dict:
    return {"status": True, "data": _serialize(_account(db, customer))}


def save_connection(db: Session, customer: Customer, payload: ConnectionSchema) -> dict:
    account = _account(db, customer)
    # one Meta number belongs to one of the workspace's numbers (webhooks are routed by it)
    main_id = customer.parent_id or customer.id
    taken = (db.query(WhatsAppAccount).join(Customer, Customer.id == WhatsAppAccount.customer_id)
             .filter((Customer.id == main_id) | (Customer.parent_id == main_id),
                     WhatsAppAccount.phone_number_id == payload.phone_number_id,
                     WhatsAppAccount.status != "disconnected"))
    if account is not None:
        taken = taken.filter(WhatsAppAccount.id != account.id)
    if taken.first() is not None:
        raise field_error(409, "phone_number_id", "This number is already connected to another of your "
                                                  "numbers. Switch to it with the number switcher.")
    if account is None:
        if not payload.access_token:
            raise field_error(422, "access_token", "Paste the permanent access token from your Meta system user")
        account = WhatsAppAccount(
            customer_id=customer.id,
            webhook_key=secrets.token_urlsafe(24),
            verify_token=secrets.token_urlsafe(24),
        )
        db.add(account)
    account.waba_id = payload.waba_id
    account.phone_number_id = payload.phone_number_id
    if payload.access_token:
        account.access_token = encrypt_secret(payload.access_token)
    if payload.app_secret:
        account.app_secret = encrypt_secret(payload.app_secret)
    _refresh_number(account)
    db.commit()
    message = ("WhatsApp number connected" if account.status == "connected"
               else "Saved, but Meta rejected the details. See the error below.")
    return {"status": True, "message": message, "data": _serialize(account)}


def refresh(db: Session, customer: Customer) -> dict:
    account = _account(db, customer)
    if account is None:
        raise HTTPException(404, detail="Connect a WhatsApp number first")
    _refresh_number(account)
    db.commit()
    return {"status": True, "message": "Status refreshed", "data": _serialize(account)}


def send_test(db: Session, customer: Customer, payload: TestMessageSchema) -> dict:
    account = _account(db, customer)
    if account is None or account.status != "connected":
        raise HTTPException(422, detail="Connect a working WhatsApp number first")
    try:
        result = WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "") \
            .send_text(payload.to, payload.text)
    except WhatsAppError as exc:
        # Outside the 24-hour window Meta only accepts approved templates (error 131047)
        raise field_error(422, "to", str(exc)) from exc
    wamid = (result.get("messages") or [{}])[0].get("id")
    return {"status": True, "message": "Message sent", "data": {"message_id": wamid}}


def disconnect(db: Session, customer: Customer) -> dict:
    account = _account(db, customer)
    if account is not None:
        db.delete(account)
        db.commit()
    return {"status": True, "message": "WhatsApp number disconnected", "data": None}


def overview(db: Session, customer: Customer) -> dict:
    account = _account(db, customer)
    messages = dict(db.query(WaMessage.direction, func.count(WaMessage.id))
                    .filter(WaMessage.customer_id == customer.id).group_by(WaMessage.direction).all())
    conversations = db.query(
        func.count(WaConversation.id),
        func.sum(case((WaConversation.status != "resolved", 1), else_=0)),
        func.sum(case((WaConversation.unread_count > 0, 1), else_=0)),
    ).filter(WaConversation.customer_id == customer.id).one()
    events = 0
    if account is not None:
        events = db.query(func.count(WhatsAppWebhookEvent.id)).filter(
            WhatsAppWebhookEvent.account_id == account.id).scalar() or 0
    counts = {
        "messages": int(messages.get("in", 0)),
        "sent": int(messages.get("out", 0)),
        "contacts": int(db.query(func.count(WaContact.id)).filter(WaContact.customer_id == customer.id).scalar() or 0),
        "conversations": int(conversations[0] or 0),
        "open_conversations": int(conversations[1] or 0),
        "unread": int(conversations[2] or 0),
        "events": int(events),
    }
    return {"status": True, "data": {"connection": _serialize(account), "counts": counts, "generated_at": iso(now())}}
