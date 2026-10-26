"""The shapes the public API returns and webhooks send. They are a public contract: add fields, never
rename or remove them."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.customer.inbox.models import WaContact, WaMessage
from app.shared.utils.datetime import iso


def contact(c: WaContact) -> dict:
    return {
        "id": c.id,
        "phone": f"+{c.wa_id}",
        "wa_id": c.wa_id,
        "name": c.name,
        "profile_name": c.profile_name,
        "email": c.email,
        "tags": c.tags or [],
        "attributes": c.attributes or {},
        "opted_out": bool(c.opted_out),
        "blocked": bool(c.blocked),
        "source": c.source,
        "created_at": iso(c.created_at),
        "last_message_at": iso(c.last_message_at),
    }


def message(m: WaMessage, c: WaContact | None = None) -> dict:
    c = c or (m.conversation.contact if m.conversation else None)
    out = {
        "id": m.id,
        "wamid": m.wamid,
        "direction": "inbound" if m.direction == "in" else "outbound",
        "type": m.type,
        "text": m.text,
        "status": m.status,
        "to" if m.direction == "out" else "from": f"+{c.wa_id}" if c else None,
        "contact": {"id": c.id, "phone": f"+{c.wa_id}", "name": c.name or c.profile_name} if c else None,
        "conversation_id": m.conversation_id,
        "template_name": m.template_name,
        "media": ({"mime_type": m.media_mime, "filename": m.media_filename, "size": m.media_size}
                  if m.media_id or m.media_mime else None),
        "reply_to_wamid": m.context_wamid,
        "sent_by": m.sent_by,
        "error": {"code": m.error_code, "message": m.error_message} if m.status == "failed" else None,
        "created_at": iso(m.created_at),
        "sent_at": iso(m.sent_at),
        "delivered_at": iso(m.delivered_at),
        "read_at": iso(m.read_at),
    }
    if m.type == "interactive" and isinstance(m.payload, dict):  # a button or list reply: its id too
        reply = (m.payload.get("interactive") or {})
        picked = reply.get("button_reply") or reply.get("list_reply")
        if picked:
            out["reply"] = {"id": picked.get("id"), "title": picked.get("title")}
    if m.type == "button" and isinstance(m.payload, dict):
        out["reply"] = {"id": (m.payload.get("button") or {}).get("payload"), "title": m.text}
    return out


def conversation(cv) -> dict:
    return {
        "id": cv.id,
        "status": cv.status,
        "contact": contact(cv.contact),
        "unread_count": cv.unread_count,
        "last_message_at": iso(cv.last_message_at),
        "last_message": cv.last_message_preview,
        "last_message_direction": {"in": "inbound", "out": "outbound"}.get(cv.last_message_direction),
        "window_open": _window_open(cv),
        "assignee": (cv.assignee.name or cv.assignee.email) if cv.assignee else None,
        "team": cv.team.name if cv.team else None,
    }


def _window_open(cv) -> bool:
    from app.modules.customer.inbox.service import window_open

    return window_open(cv)


def order(o, store) -> dict:
    from app.modules.customer.commerce import orders, service

    return {
        "id": o.id,
        "number": orders.order_ref(o, store),
        "status": o.status,
        "payment_status": o.payment_status,
        "payment_method": o.payment_method,
        "source": o.source,
        "currency": o.currency,
        "subtotal": float(service.to_major(o.subtotal)),
        "discount": float(service.to_major(o.discount)),
        "shipping": float(service.to_major(o.shipping)),
        "tax": float(service.to_major(o.tax)),
        "total": float(service.to_major(o.total)),
        "coupon_code": o.coupon_code,
        "items": [{"name": i.name, "sku": getattr(i, "retailer_id", None), "quantity": i.quantity,
                   "unit_price": float(service.to_major(i.unit_price))} for i in o.items],
        "customer": {"name": o.customer_name, "phone": o.customer_phone},
        "address": o.address,
        "tracking": ({"courier": o.courier, "number": o.tracking_number, "url": o.tracking_url}
                     if o.tracking_number or o.tracking_url else None),
        "created_at": iso(o.created_at),
        "confirmed_at": iso(o.confirmed_at),
    }


def campaign(db: Session, cp) -> dict:
    from app.modules.customer.campaigns.models import WaCampaignRecipient

    counts = dict(db.query(WaCampaignRecipient.status, func.count(WaCampaignRecipient.id))
                  .filter(WaCampaignRecipient.campaign_id == cp.id).group_by(WaCampaignRecipient.status).all())
    return {"id": cp.id, "name": cp.name, "status": cp.status, "template_name": cp.template_name,
            "recipients": cp.total or 0, "sent": int(counts.get("sent", 0)), "failed": int(counts.get("failed", 0)),
            "skipped": cp.skipped or 0, "error": cp.error, "started_at": iso(cp.started_at),
            "completed_at": iso(cp.completed_at)}


def template(t, form: dict, needs: dict) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "language": t.language,
        "category": t.category,
        "status": t.status,
        "header": {"format": form["header"]["format"], "text": form["header"].get("text") or None}
        if form["header"]["format"] != "none" else None,
        "body": form["body"],
        "footer": form.get("footer") or None,
        "buttons": [{"index": i, "type": b["type"], "text": b["text"]} for i, b in enumerate(form["buttons"])],
        "variables": {"header": needs["header"], "body": needs["body"],
                      "buttons": [{"index": b["index"], "type": b["type"]} for b in needs["buttons"]]},
    }
