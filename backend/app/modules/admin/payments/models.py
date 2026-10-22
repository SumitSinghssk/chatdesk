from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base
from app.shared.utils.datetime import now


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    gateway = Column(String(30), nullable=False, index=True)
    purpose = Column(String(50), nullable=False, default="payment", index=True)
    reference = Column(String(64), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False)
    status = Column(String(20), nullable=False, default="created", index=True)
    test_mode = Column(Boolean, nullable=False, default=False)
    gateway_order_id = Column(String(100), nullable=True, unique=True)
    gateway_payment_id = Column(String(100), nullable=True, index=True)
    method = Column(String(30), nullable=True)
    description = Column(String(255), nullable=True)
    payer = Column(JSON, nullable=True)
    notes = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)
    updated_at = Column(DateTime, default=now, onupdate=now, nullable=False)


class PaymentWebhook(Base):
    __tablename__ = "payment_webhooks"
    __table_args__ = (UniqueConstraint("gateway", "event_id", name="uq_payment_webhooks_event"),)

    id = Column(Integer, primary_key=True)
    gateway = Column(String(30), nullable=False, index=True)
    event = Column(String(100), nullable=False)
    event_id = Column(String(100), nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    signature_valid = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="received")
    error = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)
