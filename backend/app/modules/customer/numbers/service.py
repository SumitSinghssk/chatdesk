"""A workspace's WhatsApp numbers: the switcher's list, adding, renaming, switching and deleting.

Each number keeps its own chats, contacts, templates, campaigns, chatbots, automation, AI agents,
store and analytics (see team/access.py). The first number is the owner's own account and can't be
deleted; numbers added later can, with everything in them.
"""
from fastapi import HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.inbox.models import WaConversation
from app.modules.customer.numbers.schemas import DeleteNumberSchema, NumberSchema
from app.modules.customer.team.access import NUMBER_COOKIE, as_main, numbers, role_of
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.shared.enums import Status

MAX_NUMBERS = 20
COOKIE_DAYS = 400


def label_of(number: Customer, account: WhatsAppAccount | None = None) -> str:
    if number.number_label:
        return number.number_label
    if account is not None and account.verified_name:
        return account.verified_name
    return "Main number" if not number.parent_id else f"Number {number.id}"


def _serialize(number: Customer, account: WhatsAppAccount | None, unread: int, current_id: int) -> dict:
    if account is None:
        state = "not_connected"
    else:
        state = "connected" if account.status == "connected" else "error" if account.status == "error" else "pending"
    return {
        "id": number.id,
        "label": label_of(number, account),
        "main": not number.parent_id,
        "status": state,
        "display_phone_number": account.display_phone_number if account else None,
        "verified_name": account.verified_name if account else None,
        "quality_rating": account.quality_rating if account else None,
        "unread": unread,
        "current": number.id == current_id,
    }


def _rows(db: Session, ws: Customer, items: list[Customer]) -> list[dict]:
    ids = [n.id for n in items]
    accounts = {a.customer_id: a for a in db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id.in_(ids))}
    unread = dict(db.query(WaConversation.customer_id, func.count(WaConversation.id))
                  .filter(WaConversation.customer_id.in_(ids), WaConversation.unread_count > 0)
                  .group_by(WaConversation.customer_id).all())
    return [_serialize(n, accounts.get(n.id), int(unread.get(n.id, 0)), ws.id) for n in items]


def list_numbers(db: Session, ws: Customer) -> dict:
    """The numbers the signed-in person may work on, the one in use marked."""
    return {"status": True, "data": _rows(db, ws, getattr(ws, "numbers", None) or [ws])}


def _remember(response: Response, number_id: int) -> None:
    response.set_cookie(NUMBER_COOKIE, str(number_id), max_age=COOKIE_DAYS * 86400, path="/", httponly=False,
                        secure=settings.is_production, samesite="lax")


def _number(db: Session, main: Customer, number_id: int) -> Customer:
    found = next((n for n in numbers(db, main) if n.id == number_id), None)
    if found is None:
        raise HTTPException(404, detail="Number not found")
    return found


def switch(db: Session, ws: Customer, number_id: int, response: Response) -> dict:
    allowed = getattr(ws, "numbers", None) or [ws]
    number = next((n for n in allowed if n.id == number_id), None)
    if number is None:
        raise HTTPException(404, detail="You don't have access to that number")
    _remember(response, number.id)
    row = _rows(db, number, [number])[0]
    return {"status": True, "message": f"Switched to {row['label']}", "data": row}


def create(db: Session, ws: Customer, payload: NumberSchema, response: Response) -> dict:
    main = as_main(ws)
    every = numbers(db, main)
    if len(every) >= MAX_NUMBERS:
        raise HTTPException(422, detail=f"A workspace can have up to {MAX_NUMBERS} numbers")
    if any(label_of(n).lower() == payload.label.lower() for n in every):
        raise field_error(409, "label", "Another number already has this name")
    # starts with the main number's business details and office hours; the rest is empty
    number = Customer(parent_id=main.id, name=main.name, business_name=main.business_name,
                      number_label=payload.label, signup_method="number", status=Status.ACTIVE.value,
                      role="owner", automation_settings=main.automation_settings)
    db.add(number)
    db.commit()
    _remember(response, number.id)
    row = _rows(db, number, [number])[0]
    return {"status": True, "message": f"{payload.label} added. Connect its WhatsApp number next.", "data": row}


def rename(db: Session, ws: Customer, number_id: int, payload: NumberSchema) -> dict:
    main = as_main(ws)
    number = _number(db, main, number_id)
    if any(n.id != number.id and label_of(n).lower() == payload.label.lower() for n in numbers(db, main)):
        raise field_error(409, "label", "Another number already has this name")
    number.number_label = payload.label
    db.commit()
    return {"status": True, "message": "Name saved", "data": _rows(db, ws, [number])[0]}


def delete(db: Session, ws: Customer, number_id: int, payload: DeleteNumberSchema) -> dict:
    if role_of(ws) != "owner":
        raise HTTPException(403, detail="Only the workspace owner can delete a number")
    main = as_main(ws)
    number = _number(db, main, number_id)
    if not number.parent_id:
        raise HTTPException(422, detail="The main number can't be deleted. Disconnect it in WhatsApp setup instead.")
    if payload.confirm.strip().upper() != "DELETE":
        raise field_error(422, "confirm", "Type DELETE to confirm")
    name = label_of(number)
    # the database removes everything that belonged to the number with it
    db.query(Customer).filter(Customer.id == number.id).delete(synchronize_session=False)
    db.commit()
    return {"status": True, "message": f"{name} and everything in it were deleted", "data": None}
