"""Analytics: one report of messages, chats, team speed, campaigns, automation and chatbots for a date range.

Days are counted in the business's own time zone (Automation → Office hours), and every headline number
comes with the same figure for the period just before, so the page can show the trend.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.modules.customer.account.models import Customer
from app.modules.customer.automation.engine import settings_of as automation_settings
from app.modules.customer.automation.models import WaAutoReply, WaAutoReplyHit
from app.modules.customer.campaigns import service as campaigns
from app.modules.customer.campaigns.models import WaCampaign, WaCampaignRecipient
from app.modules.customer.chatbots.models import WaChatbot, WaChatbotSession
from app.modules.customer.inbox.models import (
    WaContact,
    WaConversation,
    WaConversationEvent,
    WaMessage,
    WaResponse,
)
from app.modules.customer.team import assign as assigning
from app.shared.enums import Status
from app.shared.utils.datetime import iso

MAX_DAYS = 366
BOT_SENDER, AUTO_SENDER = "Chatbot", "Auto-reply"


class Period:
    """[start, end) in UTC for local days `first`..`last` (both included)."""

    def __init__(self, first: date, last: date, zone: ZoneInfo):
        self.first, self.last, self.zone = first, last, zone
        self.start = self._utc(first)
        self.end = self._utc(last + timedelta(days=1))

    def _utc(self, day: date) -> datetime:
        return datetime.combine(day, time.min, self.zone).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    @property
    def days(self) -> int:
        return (self.last - self.first).days + 1

    def before(self) -> "Period":
        last = self.first - timedelta(days=1)
        return Period(last - timedelta(days=self.days - 1), last, self.zone)

    def has(self, col):
        return and_(col >= self.start, col < self.end)


def _local(col, tz: str):
    """A UTC timestamp column as local wall-clock time in `tz` (Postgres)."""
    return func.timezone(tz, func.timezone("UTC", col))


def _period(ws: Customer, start: date | None, end: date | None, days: int | None) -> Period:
    zone = ZoneInfo(automation_settings(ws)["timezone"])
    today = datetime.now(zone).date()
    if start and end:
        if end < start:
            raise HTTPException(422, detail="The end date is before the start date")
        if (end - start).days + 1 > MAX_DAYS:
            raise HTTPException(422, detail="Choose a period of at most a year")
        return Period(start, end, zone)
    days = max(1, min(days or 30, MAX_DAYS))
    return Period(today - timedelta(days=days - 1), today, zone)


def _count(q) -> int:
    return int(q.scalar() or 0)


def _kpis(db: Session, owner_id: int, p: Period) -> dict:
    msg = db.query(func.count(WaMessage.id)).filter(WaMessage.customer_id == owner_id, p.has(WaMessage.created_at))
    received = _count(msg.filter(WaMessage.direction == "in", WaMessage.type != "reaction"))
    out = (db.query(func.count(WaMessage.id),
                    func.sum(case((WaMessage.status == "failed", 1), else_=0)),
                    func.sum(case((WaMessage.status.in_(("delivered", "read")), 1), else_=0)),
                    func.sum(case((WaMessage.status == "read", 1), else_=0)))
           .filter(WaMessage.customer_id == owner_id, WaMessage.direction == "out", p.has(WaMessage.created_at))
           .one())
    sent, failed, delivered, read = (int(v or 0) for v in out)
    resp = (db.query(func.count(WaResponse.id), func.avg(WaResponse.seconds),
                     func.sum(case((WaResponse.seconds <= 300, 1), else_=0)))
            .filter(WaResponse.customer_id == owner_id, p.has(WaResponse.created_at)).one())
    responses, avg, fast = int(resp[0] or 0), resp[1], int(resp[2] or 0)
    bots = (db.query(func.count(WaChatbotSession.id),
                     func.sum(case((WaChatbotSession.end_reason.in_(("completed", "handover")), 1), else_=0)))
            .filter(WaChatbotSession.customer_id == owner_id, p.has(WaChatbotSession.started_at)).one())
    delivered_ok = sent - failed
    return {
        "received": received,
        "sent": sent,
        "failed": failed,
        "delivered": delivered,
        "read": read,
        "delivery_rate": round(100 * delivered / delivered_ok) if delivered_ok else None,
        "read_rate": round(100 * read / delivered_ok) if delivered_ok else None,
        "new_chats": _count(db.query(func.count(WaConversation.id)).filter(
            WaConversation.customer_id == owner_id, p.has(WaConversation.created_at))),
        "resolved": _count(db.query(func.count(WaConversation.id)).filter(
            WaConversation.customer_id == owner_id, p.has(WaConversation.resolved_at))),
        "new_contacts": _count(db.query(func.count(WaContact.id)).filter(
            WaContact.customer_id == owner_id, p.has(WaContact.created_at))),
        "opted_out": _count(db.query(func.count(WaConversationEvent.id))
                            .join(WaConversation, WaConversation.id == WaConversationEvent.conversation_id)
                            .filter(WaConversation.customer_id == owner_id, WaConversationEvent.kind == "status",
                                    WaConversationEvent.text == "Opted out of marketing",
                                    p.has(WaConversationEvent.created_at))),
        "responses": responses,
        "avg_response_seconds": round(float(avg)) if avg is not None else None,
        "within_5_min": round(100 * fast / responses) if responses else None,
        "campaign_messages": _count(db.query(func.count(WaCampaignRecipient.id))
                                    .join(WaCampaign, WaCampaign.id == WaCampaignRecipient.campaign_id)
                                    .filter(WaCampaign.customer_id == owner_id, WaCampaignRecipient.status == "sent",
                                            p.has(WaCampaignRecipient.sent_at))),
        "bot_chats": int(bots[0] or 0),
        "bot_completed": int(bots[1] or 0),
        "auto_replies": _count(db.query(func.count(WaAutoReplyHit.id))
                               .join(WaAutoReply, WaAutoReply.id == WaAutoReplyHit.rule_id)
                               .filter(WaAutoReply.customer_id == owner_id, p.has(WaAutoReplyHit.created_at))),
    }


def _daily(db: Session, owner_id: int, p: Period, tz: str) -> list[dict]:
    rows = {p.first + timedelta(days=i): {"received": 0, "sent": 0, "new_chats": 0, "resolved": 0,
                                          "new_contacts": 0} for i in range(p.days)}

    def fill(key, col, *filters, model=None):
        day = func.date(_local(col, tz))
        q = db.query(day, func.count()).select_from(model).filter(*filters, p.has(col)).group_by(day)
        for d, n in q:
            if d in rows:
                rows[d][key] = int(n)

    fill("received", WaMessage.created_at, WaMessage.customer_id == owner_id, WaMessage.direction == "in",
         WaMessage.type != "reaction", model=WaMessage)
    fill("sent", WaMessage.created_at, WaMessage.customer_id == owner_id, WaMessage.direction == "out",
         model=WaMessage)
    fill("new_chats", WaConversation.created_at, WaConversation.customer_id == owner_id, model=WaConversation)
    fill("resolved", WaConversation.resolved_at, WaConversation.customer_id == owner_id, model=WaConversation)
    fill("new_contacts", WaContact.created_at, WaContact.customer_id == owner_id, model=WaContact)
    return [{"date": d.isoformat(), **v} for d, v in sorted(rows.items())]


def _heatmap(db: Session, owner_id: int, p: Period, tz: str) -> list[list[int]]:
    """Messages customers sent, by weekday (Mon first) and hour of the day."""
    local = _local(WaMessage.created_at, tz)
    dow, hour = func.extract("isodow", local), func.extract("hour", local)
    grid = [[0] * 24 for _ in range(7)]
    for d, h, n in (db.query(dow, hour, func.count(WaMessage.id))
                    .filter(WaMessage.customer_id == owner_id, WaMessage.direction == "in",
                            WaMessage.type != "reaction", p.has(WaMessage.created_at))
                    .group_by(dow, hour)):
        grid[int(d) - 1][int(h)] = int(n)
    return grid


def _campaign_message_ids(db: Session, owner_id: int):
    return (db.query(WaCampaignRecipient.message_id)
            .join(WaCampaign, WaCampaign.id == WaCampaignRecipient.campaign_id)
            .filter(WaCampaign.customer_id == owner_id, WaCampaignRecipient.message_id.isnot(None)))


def _sources(db: Session, owner_id: int, p: Period) -> dict:
    """Who sent the messages that went out: the team, campaigns, automatic replies or chatbots."""
    is_campaign = WaMessage.id.in_(_campaign_message_ids(db, owner_id))
    row = (db.query(func.sum(case((is_campaign, 1), else_=0)),
                    func.sum(case((and_(~is_campaign, WaMessage.sent_by == BOT_SENDER), 1), else_=0)),
                    func.sum(case((and_(~is_campaign, WaMessage.sent_by == AUTO_SENDER), 1), else_=0)),
                    func.count(WaMessage.id))
           .filter(WaMessage.customer_id == owner_id, WaMessage.direction == "out", p.has(WaMessage.created_at))
           .one())
    campaign, bot, auto, total = (int(v or 0) for v in row)
    return {"team": max(0, total - campaign - bot - auto), "campaigns": campaign, "automation": auto,
            "chatbots": bot}


def _team(db: Session, owner_id: int, p: Period) -> list[dict]:
    people = (db.query(Customer).filter((Customer.id == owner_id) | (Customer.workspace_id == owner_id),
                                        Customer.not_deleted(), Customer.status == Status.ACTIVE.value)
              .order_by(Customer.name).all())
    replies = dict(db.query(WaMessage.member_id, func.count(WaMessage.id))
                   .filter(WaMessage.customer_id == owner_id, WaMessage.direction == "out",
                           WaMessage.member_id.isnot(None), WaMessage.sent_by.notin_((BOT_SENDER, AUTO_SENDER)),
                           WaMessage.id.notin_(_campaign_message_ids(db, owner_id)),
                           p.has(WaMessage.created_at))
                   .group_by(WaMessage.member_id).all())
    resolved = dict(db.query(WaConversation.assignee_id, func.count(WaConversation.id))
                    .filter(WaConversation.customer_id == owner_id, WaConversation.assignee_id.isnot(None),
                            p.has(WaConversation.resolved_at))
                    .group_by(WaConversation.assignee_id).all())
    open_now = dict(db.query(WaConversation.assignee_id, func.count(WaConversation.id))
                    .filter(WaConversation.customer_id == owner_id, WaConversation.assignee_id.isnot(None),
                            WaConversation.status.in_(assigning.OPEN))
                    .group_by(WaConversation.assignee_id).all())
    speed = {m: (int(n), avg, int(fast or 0)) for m, n, avg, fast in (
        db.query(WaResponse.member_id, func.count(WaResponse.id), func.avg(WaResponse.seconds),
                 func.sum(case((WaResponse.seconds <= 300, 1), else_=0)))
        .filter(WaResponse.customer_id == owner_id, p.has(WaResponse.created_at))
        .group_by(WaResponse.member_id))}
    rows = []
    for person in people:
        n, avg, fast = speed.get(person.id, (0, None, 0))
        rows.append({"id": person.id, "name": person.name or person.email,
                     "role": "owner" if person.id == owner_id else person.role,
                     "replies": int(replies.get(person.id, 0)), "resolved": int(resolved.get(person.id, 0)),
                     "open_chats": int(open_now.get(person.id, 0)), "responses": n,
                     "avg_response_seconds": round(float(avg)) if avg is not None else None,
                     "within_5_min": round(100 * fast / n) if n else None})
    return sorted(rows, key=lambda r: (-r["replies"], r["name"] or ""))


def _campaigns(db: Session, owner_id: int, p: Period) -> list[dict]:
    rows = (db.query(WaCampaign).filter(WaCampaign.customer_id == owner_id, WaCampaign.started_at.isnot(None),
                                        p.has(WaCampaign.started_at))
            .order_by(WaCampaign.started_at.desc()).limit(50).all())
    reports = campaigns._report(db, [c.id for c in rows])
    out = []
    for c in rows:
        r = reports.get(c.id, campaigns.EMPTY_REPORT)
        delivered_to = [w for (w,) in (
            db.query(WaContact.wa_id).join(WaCampaignRecipient, WaCampaignRecipient.contact_id == WaContact.id)
            .join(WaMessage, WaMessage.id == WaCampaignRecipient.message_id)
            .filter(WaCampaignRecipient.campaign_id == c.id, WaMessage.status.in_(("delivered", "read"))))]
        cost = sum(campaigns._rate(w, (c.template_category or "marketing").lower()) for w in delivered_to)
        out.append({"id": c.id, "name": c.name, "status": c.status, "template_name": c.template_name,
                    "started_at": iso(c.started_at), **{k: r[k] for k in ("sent", "delivered", "read", "replied",
                                                                           "clicked", "failed")},
                    "cost": round(cost, 2)})
    return out


def _chatbots(db: Session, owner_id: int, p: Period) -> list[dict]:
    rows = (db.query(WaChatbot.id, WaChatbot.name, WaChatbot.active, func.count(WaChatbotSession.id),
                     func.sum(case((WaChatbotSession.end_reason == "completed", 1), else_=0)),
                     func.sum(case((WaChatbotSession.end_reason == "handover", 1), else_=0)),
                     func.sum(case((WaChatbotSession.status == "active", 1), else_=0)))
            .join(WaChatbotSession, and_(WaChatbotSession.chatbot_id == WaChatbot.id,
                                         p.has(WaChatbotSession.started_at)))
            .filter(WaChatbot.customer_id == owner_id)
            .group_by(WaChatbot.id, WaChatbot.name, WaChatbot.active)
            .order_by(func.count(WaChatbotSession.id).desc()).all())
    out = []
    for bot_id, name, active, started, completed, handover, talking in rows:
        completed, handover, talking = int(completed or 0), int(handover or 0), int(talking or 0)
        done = started - talking
        out.append({"id": bot_id, "name": name, "active": active, "started": started, "completed": completed,
                    "handover": handover, "dropped": done - completed - handover,
                    "completion_rate": round(100 * (completed + handover) / done) if done else None})
    return out


def _auto_replies(db: Session, owner_id: int, p: Period) -> list[dict]:
    rows = (db.query(WaAutoReply.id, WaAutoReply.name, WaAutoReply.trigger, func.count(WaAutoReplyHit.id))
            .join(WaAutoReplyHit, and_(WaAutoReplyHit.rule_id == WaAutoReply.id, p.has(WaAutoReplyHit.created_at)))
            .filter(WaAutoReply.customer_id == owner_id)
            .group_by(WaAutoReply.id, WaAutoReply.name, WaAutoReply.trigger)
            .order_by(func.count(WaAutoReplyHit.id).desc()).limit(10).all())
    return [{"id": i, "name": n, "trigger": t, "sent": int(c)} for i, n, t, c in rows]


def _now(db: Session, owner_id: int) -> dict:
    by_status = dict(db.query(WaConversation.status, func.count(WaConversation.id))
                     .filter(WaConversation.customer_id == owner_id).group_by(WaConversation.status).all())
    open_q = db.query(func.count(WaConversation.id)).filter(WaConversation.customer_id == owner_id,
                                                            WaConversation.status.in_(assigning.OPEN))
    return {"open": int(by_status.get("open", 0)), "pending": int(by_status.get("pending", 0)),
            "waiting": _count(open_q.filter(WaConversation.waiting_since.isnot(None))),
            "unassigned": _count(open_q.filter(WaConversation.assignee_id.is_(None))),
            "contacts": _count(db.query(func.count(WaContact.id)).filter(WaContact.customer_id == owner_id)),
            "bots_talking": _count(db.query(func.count(WaChatbotSession.id)).filter(
                WaChatbotSession.customer_id == owner_id, WaChatbotSession.status == "active"))}


def report(db: Session, ws: Customer, start: date | None, end: date | None, days: int | None) -> dict:
    p = _period(ws, start, end, days)
    tz = automation_settings(ws)["timezone"]
    prev = p.before()
    return {"status": True, "data": {
        "period": {"start": p.first.isoformat(), "end": p.last.isoformat(), "days": p.days, "timezone": tz,
                   "previous": {"start": prev.first.isoformat(), "end": prev.last.isoformat()}},
        "kpis": _kpis(db, ws.id, p),
        "previous": _kpis(db, ws.id, prev),
        "daily": _daily(db, ws.id, p, tz),
        "heatmap": _heatmap(db, ws.id, p, tz),
        "sources": _sources(db, ws.id, p),
        "team": _team(db, ws.id, p),
        "campaigns": _campaigns(db, ws.id, p),
        "chatbots": _chatbots(db, ws.id, p),
        "auto_replies": _auto_replies(db, ws.id, p),
        "now": _now(db, ws.id),
    }}
