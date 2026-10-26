from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class ApiKey(Base):
    """A secret key for the public API, for one WhatsApp number. Only its hash is kept."""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    prefix = Column(String(16), nullable=False)  # the start of the key, to tell keys apart
    key_hash = Column(String(64), nullable=False, unique=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
    last_used_at = Column(DateTime, nullable=True)
    last_used_ip = Column(String(64), nullable=True)


class WebhookEndpoint(Base, TimestampMixin):
    """A URL of the business's that ChatDesk calls when something happens on one number."""

    __tablename__ = "webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    description = Column(String(200), nullable=True)
    events = Column(JSON, nullable=False, default=list)
    secret = Column(Text, nullable=False)  # encrypted; signs every call
    enabled = Column(Boolean, nullable=False, default=True)
    failures_in_row = Column(Integer, nullable=False, default=0, server_default="0")
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)


class WebhookDelivery(Base):
    """One event sent (or to be sent) to one endpoint, with every try's result."""

    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        Index("ix_webhook_deliveries_due", "status", "next_attempt_at"),
        Index("ix_webhook_deliveries_endpoint_id_id", "endpoint_id", "id"),
    )

    id = Column(Integer, primary_key=True)
    endpoint_id = Column(Integer, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(40), nullable=False)
    event_id = Column(String(40), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String(10), nullable=False, default="pending")  # pending | success | failed
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, nullable=True)
    response_status = Column(Integer, nullable=True)
    response_body = Column(String(1000), nullable=True)
    error = Column(String(255), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now, index=True)
    last_attempt_at = Column(DateTime, nullable=True)
