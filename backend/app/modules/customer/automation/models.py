from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WaAutoReply(Base, TimestampMixin):
    """An automatic reply: to keywords, a first message, outside office hours, or anything else."""

    __tablename__ = "wa_auto_replies"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    trigger = Column(String(20), nullable=False, default="keyword")  # keyword | welcome | away | default
    match = Column(String(20), nullable=False, default="contains")  # exact | contains | starts_with (keywords)
    keywords = Column(JSON, nullable=False, default=list)
    # what to send: {"type": "text" | "media" | "buttons" | "list" | "location", ...} (see schemas.ReplySchema)
    reply = Column(JSON, nullable=False, default=dict)
    cooldown_minutes = Column(Integer, nullable=False, default=0)  # at most once per person in this time
    active = Column(Boolean, nullable=False, default=True)
    position = Column(Integer, nullable=False, default=0)  # keyword rules are checked in this order
    hits = Column(Integer, nullable=False, default=0)
    last_hit_at = Column(DateTime, nullable=True)
    # WhatsApp media id of the attached file, reused while Meta keeps it (30 days)
    media_id = Column(String(64), nullable=True)
    media_uploaded_at = Column(DateTime, nullable=True)


class WaAutoReplyHit(Base):
    """One automatic reply sent to one contact (for cooldowns and reporting)."""

    __tablename__ = "wa_auto_reply_hits"
    __table_args__ = (Index("ix_wa_auto_reply_hits_rule_contact", "rule_id", "contact_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    rule_id = Column(Integer, ForeignKey("wa_auto_replies.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False)
