from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class WaCallSettings(Base, TimestampMixin):
    """WhatsApp calling for one number: on/off at Meta, the missed-call message, the permission request text."""

    __tablename__ = "wa_call_settings"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=False)
    followup_on = Column(Boolean, nullable=False, default=True)
    followup_text = Column(Text, nullable=True)
    permission_text = Column(Text, nullable=True)
    synced_at = Column(DateTime, nullable=True)
    sync_error = Column(Text, nullable=True)


class WaCall(Base):
    """One WhatsApp call, from the customer (inbound) or to them (outbound), answered in the browser."""

    __tablename__ = "wa_calls"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False)
    wacid = Column(String(128), nullable=False, unique=True)  # Meta's call id
    direction = Column(String(3), nullable=False)  # in | out
    # in: ringing | answering | answered | ended | missed | declined | failed
    # out: dialing | ringing | answered | ended | rejected | no_answer | failed
    status = Column(String(12), nullable=False, index=True)
    offer_sdp = Column(Text, nullable=True)
    answer_sdp = Column(Text, nullable=True)
    ringing_ids = Column(JSON, nullable=False, default=list)  # team members it rings for
    declined_ids = Column(JSON, nullable=False, default=list)
    claimed_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    answered_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    answered_at = Column(DateTime, nullable=True)
    started_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    ended_at = Column(DateTime, nullable=True)
    ended_by = Column(String(12), nullable=True)  # customer | team | system
    duration = Column(Integer, nullable=True)  # seconds talked
    error_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now, index=True)
    updated_at = Column(DateTime, nullable=False, default=now)


class WaCallPermission(Base):
    """Whether a customer allows the business to call them (Meta requires it before business-initiated calls)."""

    __tablename__ = "wa_call_permissions"
    __table_args__ = (UniqueConstraint("contact_id", name="uq_wa_call_permissions_contact"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(12), nullable=False, default="none")  # none | requested | temporary | permanent | rejected | expired
    expires_at = Column(DateTime, nullable=True)
    requested_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    response_source = Column(String(20), nullable=True)  # user_action | automatic | auto_revoked
    unanswered = Column(Integer, nullable=False, default=0)  # calls in a row they didn't pick up
    updated_at = Column(DateTime, nullable=False, default=now)
