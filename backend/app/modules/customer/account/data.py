"""Your data: download everything as a ZIP, and delete the account (owners) or leave the workspace."""

import io
import json
import re
import zipfile
from datetime import date, datetime

from fastapi import HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.customer_auth import clear_session_cookies
from app.modules.customer.account.models import (
    Customer,
    CustomerLoginEvent,
    CustomerNotification,
    CustomerSession,
)
from app.modules.customer.account.security import confirm_identity
from app.modules.customer.account.serializers import serialize_customer
from app.shared.enums import Status
from app.shared.utils.datetime import now

# never exported: passwords, keys, tokens, 2FA secrets
SECRET = re.compile(r"password|secret|token|api_key|access_key|two_factor|invite_token|pending_email_code|"
                    r"webhook_key|verify_token|code_hash", re.I)


def _rows(rows) -> list[dict]:
    out = []
    for row in rows:
        item = {}
        for col in row.__table__.columns:
            if SECRET.search(col.name):
                continue
            value = getattr(row, col.key)
            item[col.name] = value.isoformat() if isinstance(value, datetime | date) else value
        out.append(item)
    return out


def _dump(zf: zipfile.ZipFile, name: str, rows) -> int:
    data = _rows(rows)
    zf.writestr(name, json.dumps(data, ensure_ascii=False, indent=1, default=str))
    return len(data)


def export(db: Session, person: Customer) -> StreamingResponse:
    """The owner gets the whole workspace; a team member gets their own account."""
    from app.modules.customer.ai_agent.models import AiAgent, AiSource, AiThread
    from app.modules.customer.automation.models import WaAutoReply
    from app.modules.customer.campaigns.models import WaCampaign
    from app.modules.customer.chatbots.models import WaChatbot
    from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage, WaNote, WaQuickReply
    from app.modules.customer.templates.models import WaTemplate

    buffer = io.BytesIO()
    counts: dict[str, int] = {}
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("account.json", json.dumps(serialize_customer(person), ensure_ascii=False, indent=1))
        counts["login history"] = _dump(zf, "login_history.json", db.query(CustomerLoginEvent).filter(
            CustomerLoginEvent.customer_id == person.id).order_by(CustomerLoginEvent.id))
        counts["devices"] = _dump(zf, "devices.json", db.query(CustomerSession).filter(
            CustomerSession.customer_id == person.id).order_by(CustomerSession.id))
        counts["notifications"] = _dump(zf, "notifications.json", db.query(CustomerNotification).filter(
            CustomerNotification.customer_id == person.id).order_by(CustomerNotification.id))
        if person.workspace_id is None:  # the owner: everything in the workspace, every number
            owner = person.id
            ids = [owner, *(i for (i,) in db.query(Customer.id).filter(Customer.parent_id == owner,
                                                                         Customer.not_deleted()))]
            tables = {
                "team.json": db.query(Customer).filter(Customer.workspace_id == owner),
                "numbers.json": db.query(Customer).filter(Customer.id.in_(ids)),
                "contacts.json": db.query(WaContact).filter(WaContact.customer_id.in_(ids)),
                "conversations.json": db.query(WaConversation).filter(WaConversation.customer_id.in_(ids)),
                "messages.json": db.query(WaMessage).filter(WaMessage.customer_id.in_(ids)),
                "notes.json": db.query(WaNote).filter(WaNote.customer_id.in_(ids)),
                "quick_replies.json": db.query(WaQuickReply).filter(WaQuickReply.customer_id.in_(ids)),
                "templates.json": db.query(WaTemplate).filter(WaTemplate.customer_id.in_(ids)),
                "campaigns.json": db.query(WaCampaign).filter(WaCampaign.customer_id.in_(ids)),
                "automatic_replies.json": db.query(WaAutoReply).filter(WaAutoReply.customer_id.in_(ids)),
                "chatbots.json": db.query(WaChatbot).filter(WaChatbot.customer_id.in_(ids)),
                "ai_agents.json": db.query(AiAgent).filter(AiAgent.customer_id.in_(ids)),
                "ai_knowledge.json": db.query(AiSource).filter(AiSource.customer_id.in_(ids)),
                "ai_conversations.json": db.query(AiThread).filter(AiThread.customer_id.in_(ids)),
            }
            for name, query in tables.items():
                model = query.column_descriptions[0]["entity"]
                counts[name.removesuffix(".json").replace("_", " ")] = _dump(zf, name, query.order_by(model.id))
        zf.writestr("README.txt", "ChatDesk data export\n\nMade " + now().strftime("%Y-%m-%d %H:%M UTC") +
                    "\n\n" + "\n".join(f"{k}: {v}" for k, v in counts.items()) +
                    "\n\nPasswords, API keys and other secrets are never included.\n")
    buffer.seek(0)
    name = f"chatdesk-export-{now():%Y%m%d}.zip"
    return StreamingResponse(buffer, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


def delete_account(db: Session, person: Customer, payload, request: Request, response: Response) -> dict:
    """Owners delete the account and its whole workspace; team members leave the workspace."""
    owner = person.workspace_id is None
    if payload.confirm.strip().upper() != ("DELETE" if owner else "LEAVE"):
        raise HTTPException(status_code=422, detail={"message": "Type the word shown to confirm",
                                                     "errors": {"confirm": ["Type the word shown to confirm"]}})
    confirm_identity(person, payload.password, payload.code)
    stamp = now()
    if owner:
        from app.modules.customer.ai_agent.models import AiAgent
        from app.modules.customer.campaigns.models import WaCampaign
        from app.modules.customer.whatsapp.models import WhatsAppAccount

        people = db.query(Customer).filter((Customer.id == person.id) | (Customer.workspace_id == person.id)
                                           | (Customer.parent_id == person.id), Customer.not_deleted()).all()
        ids = [p.id for p in people if p.id == person.id or p.parent_id == person.id]  # every number
        # nothing keeps answering or sending for a deleted account
        db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id.in_(ids)) \
            .update({WhatsAppAccount.status: "disconnected"}, synchronize_session=False)
        db.query(AiAgent).filter(AiAgent.customer_id.in_(ids)).update(
            {AiAgent.whatsapp_enabled: False, AiAgent.widget_enabled: False, AiAgent.api_enabled: False},
            synchronize_session=False)
        db.query(WaCampaign).filter(WaCampaign.customer_id.in_(ids),
                                    WaCampaign.status.in_(("scheduled", "sending", "paused"))) \
            .update({WaCampaign.status: "cancelled"}, synchronize_session=False)
        message = "Your account and workspace were deleted"
    else:
        from app.modules.customer.inbox.models import WaConversation
        from app.modules.customer.team.models import WaTeamMember

        db.query(WaConversation).filter(WaConversation.assignee_id == person.id) \
            .update({WaConversation.assignee_id: None, WaConversation.assigned_at: None}, synchronize_session=False)
        db.query(WaTeamMember).filter(WaTeamMember.member_id == person.id).delete(synchronize_session=False)
        people = [person]
        message = "You left the workspace"
    for p in people:
        p.deleted_at, p.status = stamp, Status.INACTIVE.value
        db.query(CustomerSession).filter(CustomerSession.customer_id == p.id, CustomerSession.revoked_at.is_(None)) \
            .update({CustomerSession.revoked_at: stamp}, synchronize_session=False)
    db.commit()
    clear_session_cookies(response)
    return {"status": True, "message": message, "data": None}
