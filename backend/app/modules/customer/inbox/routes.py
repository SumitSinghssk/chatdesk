from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.inbox import service
from app.modules.customer.inbox.schemas import (
    ContactUpdateSchema,
    NoteSchema,
    QuickReplySchema,
    SendTemplateSchema,
    SendTextSchema,
    StartConversationSchema,
    StatusSchema,
)
from app.modules.customer.team.access import require_workspace
from app.modules.customer.team.schemas import AssignSchema

router = APIRouter(prefix="/inbox", tags=["Customer Inbox"])
_csrf = Depends(require_customer_csrf)
_send_limit = Depends(RateLimit(60, 60))


@router.get("/summary")
def summary(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.summary(db, customer)


@router.get("/conversations")
def conversations(
    status: Literal["open", "pending", "resolved", "all"] | None = None,
    search: str | None = None,
    unread: bool = False,
    page: int | None = None,
    per_page: int | None = None,
    assignee: str | None = Query(None, pattern=r"^(me|unassigned|\d+)$"),
    team_id: int | None = None,
    customer: Customer = Depends(require_workspace),
    db: Session = Depends(get_db),
):
    return service.list_conversations(db, customer, status, search, unread, page, per_page, assignee, team_id)


@router.post("/conversations", dependencies=[_csrf])
def start_conversation(payload: StartConversationSchema, customer: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    return service.start_conversation(db, customer, payload)


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: int, customer: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return service.get_conversation(db, customer, conversation_id)


@router.put("/conversations/{conversation_id}/assign", dependencies=[_csrf])
def assign(conversation_id: int, payload: AssignSchema, customer: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.assign_conversation(db, customer, conversation_id, payload.assignee_id, payload.team_id)


@router.put("/conversations/{conversation_id}/status", dependencies=[_csrf])
def set_status(conversation_id: int, payload: StatusSchema, customer: Customer = Depends(require_workspace),
               db: Session = Depends(get_db)):
    return service.set_status(db, customer, conversation_id, payload)


@router.post("/conversations/{conversation_id}/read", dependencies=[_csrf])
def mark_read(conversation_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.mark_read(db, customer, conversation_id)


@router.get("/conversations/{conversation_id}/messages")
def messages(conversation_id: int, before: int | None = None, after: int | None = None,
             limit: int = Query(50, ge=1, le=100), customer: Customer = Depends(require_workspace),
             db: Session = Depends(get_db)):
    return service.list_messages(db, customer, conversation_id, before, after, limit)


@router.post("/conversations/{conversation_id}/messages", dependencies=[_send_limit, _csrf])
def send_text(conversation_id: int, payload: SendTextSchema, customer: Customer = Depends(require_workspace),
              db: Session = Depends(get_db)):
    return service.send_text(db, customer, conversation_id, payload)


@router.post("/conversations/{conversation_id}/media", dependencies=[_send_limit, _csrf])
def send_media(conversation_id: int, file: UploadFile = File(...), caption: str | None = Form(None),
               customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.send_media(db, customer, conversation_id, file, caption)


@router.post("/conversations/{conversation_id}/template", dependencies=[_send_limit, _csrf])
def send_template(conversation_id: int, payload: SendTemplateSchema,
                  customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.send_template(db, customer, conversation_id, payload)


@router.put("/conversations/{conversation_id}/contact", dependencies=[_csrf])
def update_contact(conversation_id: int, payload: ContactUpdateSchema,
                   customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.update_contact(db, customer, conversation_id, payload)


@router.get("/conversations/{conversation_id}/notes")
def notes(conversation_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_notes(db, customer, conversation_id)


@router.post("/conversations/{conversation_id}/notes", dependencies=[_csrf])
def add_note(conversation_id: int, payload: NoteSchema, customer: Customer = Depends(require_workspace),
             db: Session = Depends(get_db)):
    return service.add_note(db, customer, conversation_id, payload)


@router.delete("/conversations/{conversation_id}/notes/{note_id}", dependencies=[_csrf])
def delete_note(conversation_id: int, note_id: int, customer: Customer = Depends(require_workspace),
                db: Session = Depends(get_db)):
    return service.delete_note(db, customer, conversation_id, note_id)


@router.get("/messages/{message_id}/media")
def media(message_id: int, download: bool = False, customer: Customer = Depends(require_workspace),
          db: Session = Depends(get_db)):
    return service.media(db, customer, message_id, download)


@router.post("/messages/{message_id}/retry", dependencies=[_send_limit, _csrf])
def retry(message_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.retry(db, customer, message_id)


@router.post("/conversations/{conversation_id}/typing", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def typing(conversation_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.typing(db, customer, conversation_id)


@router.get("/quick-replies")
def quick_replies(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_quick_replies(db, customer)


@router.post("/quick-replies", dependencies=[_csrf])
def create_quick_reply(payload: QuickReplySchema, customer: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    return service.create_quick_reply(db, customer, payload)


@router.put("/quick-replies/{quick_id}", dependencies=[_csrf])
def update_quick_reply(quick_id: int, payload: QuickReplySchema, customer: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    return service.update_quick_reply(db, customer, quick_id, payload)


@router.delete("/quick-replies/{quick_id}", dependencies=[_csrf])
def delete_quick_reply(quick_id: int, customer: Customer = Depends(require_workspace),
                       db: Session = Depends(get_db)):
    return service.delete_quick_reply(db, customer, quick_id)


@router.get("/templates")
def templates(fresh: bool = False, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_templates(db, customer, fresh)


@router.get("/tags")
def tags(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.contact_tags(db, customer)
