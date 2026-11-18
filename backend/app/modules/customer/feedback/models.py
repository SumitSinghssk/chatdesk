from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class WaFeedbackSettings(Base, TimestampMixin):
    """Asking customers how it went (1-5) after a chat is resolved or an order is delivered."""

    __tablename__ = "wa_feedback_settings"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=False)
    on_resolve = Column(Boolean, nullable=False, default=True)
    on_delivered = Column(Boolean, nullable=False, default=True)
    question = Column(Text, nullable=True)
    thanks_text = Column(Text, nullable=True)  # 4-5
    sorry_text = Column(Text, nullable=True)  # 1-2
    review_url = Column(String(500), nullable=True)  # sent with the thanks, e.g. a Google review link
    gap_days = Column(SmallInteger, nullable=False, default=7)  # ask the same customer at most this often


class WaFeedback(Base):
    """One "how did we do?" question and the customer's answer."""

    __tablename__ = "wa_feedback"
    __table_args__ = (Index("ix_wa_feedback_customer_asked", "customer_id", "asked_at"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)  # who handled it
    source = Column(String(10), nullable=False)  # resolve | order
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="SET NULL"), nullable=True)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)
    score = Column(SmallInteger, nullable=True)  # 1-5 once answered
    asked_at = Column(DateTime, nullable=False, default=now)
    answered_at = Column(DateTime, nullable=True)
