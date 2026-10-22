from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import backref, relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WhatsAppAccount(Base, TimestampMixin):
    """A customer's WhatsApp Business number, connected through the Cloud API."""

    __tablename__ = "whatsapp_accounts"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    # Public id in the webhook URL: /api/v1/website/whatsapp/webhook/{webhook_key}
    webhook_key = Column(String(64), nullable=False, unique=True, index=True)
    waba_id = Column(String(64), nullable=False)
    phone_number_id = Column(String(64), nullable=False)
    access_token = Column(Text, nullable=False)  # encrypted
    app_secret = Column(Text, nullable=True)  # encrypted
    verify_token = Column(String(128), nullable=False)
    display_phone_number = Column(String(32), nullable=True)
    verified_name = Column(String(255), nullable=True)
    quality_rating = Column(String(20), nullable=True)
    messaging_limit_tier = Column(String(40), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | connected | error
    last_error = Column(Text, nullable=True)
    webhook_verified_at = Column(DateTime, nullable=True)
    last_event_at = Column(DateTime, nullable=True)

    events = relationship("WhatsAppWebhookEvent", back_populates="account", cascade="all, delete-orphan",
                          passive_deletes=True)
    customer = relationship("Customer", backref=backref("whatsapp_account", uselist=False, passive_deletes=True))


class WhatsAppWebhookEvent(Base):
    """Raw webhook payloads from Meta, kept for processing, replay and debugging."""

    __tablename__ = "whatsapp_webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(40), nullable=False, default="unknown")  # message | status | template | other
    payload = Column(JSON, nullable=False)
    processed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, index=True)

    account = relationship("WhatsAppAccount", back_populates="events")
