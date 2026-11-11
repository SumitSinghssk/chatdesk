from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


def default_rule() -> dict:
    return {"on": False, "text": "", "template_id": None}


class CallSettings(Base, TimestampMixin):
    """A number's calling provider (the business's own account) and what happens after each call."""

    __tablename__ = "call_settings"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    provider = Column(String(30), nullable=False, default="exotel")
    # Public id in the callback URL: /api/v1/website/calls/webhook/{webhook_key}
    webhook_key = Column(String(64), nullable=False, unique=True, index=True)
    # The provider's fields (see services/voice); secret ones are stored encrypted
    config = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="pending")  # pending | connected | error
    last_error = Column(Text, nullable=True)
    last_event_at = Column(DateTime, nullable=True)

    # What to send on WhatsApp after a call: {"on": bool, "text": str, "template_id": int | None}
    # `text` is sent while the 24-hour chat window is open, the template otherwise.
    answered = Column(JSON, nullable=False, default=default_rule)
    missed = Column(JSON, nullable=False, default=default_rule)
    # A call shorter than this counts as missed (voicemail, "switched off" announcements)
    min_answered_seconds = Column(Integer, nullable=False, default=5)
    record_calls = Column(Boolean, nullable=False, default=True)
    save_recordings = Column(Boolean, nullable=False, default=True)
    # The team member's phone that rings first for click-to-call
    agent_number = Column(String(20), nullable=True)


class CallLog(Base, TimestampMixin):
    """One phone call, inbound or outbound, as reported by the provider."""

    __tablename__ = "call_logs"
    __table_args__ = (UniqueConstraint("customer_id", "call_sid", name="uq_call_logs_customer_sid"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(30), nullable=False)
    call_sid = Column(String(100), nullable=False)
    direction = Column(String(10), nullable=False, default="inbound")  # inbound | outbound
    from_number = Column(String(32), nullable=True)
    to_number = Column(String(32), nullable=True)
    customer_number = Column(String(32), nullable=True, index=True)  # the other side, as a WhatsApp id
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    started_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)

    provider_status = Column(String(30), nullable=True)
    # pending | answered | missed | not_connected (the business didn't pick up, the customer never rang)
    # | unknown (the provider never reported the end)
    outcome = Column(String(20), nullable=False, default="pending", index=True)
    duration = Column(Integer, nullable=False, default=0)  # seconds both sides talked
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True, index=True)

    # The WhatsApp message sent after the call
    follow_up = Column(String(20), nullable=True)  # sent | failed | skipped
    follow_up_note = Column(Text, nullable=True)
    follow_up_message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)

    recording_url = Column(Text, nullable=True)  # at the provider
    recording_status = Column(String(20), nullable=False, default="none")  # none | pending | saved | failed
    recording_file = Column(String(255), nullable=True)  # under storage/call-recordings
    recording_size = Column(Integer, nullable=True)
    recording_attempts = Column(Integer, nullable=False, default=0)

    processed_at = Column(DateTime, nullable=True)  # the outcome was handled (message decided)
    payload = Column(JSON, nullable=True)  # the provider's last report, for debugging

    contact = relationship("WaContact")
