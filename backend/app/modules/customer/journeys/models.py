from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, SmallInteger, String, UniqueConstraint

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class WaJourney(Base, TimestampMixin):
    """An automatic message at a moment in the customer's life: after an order, to reorder, on their birthday."""

    __tablename__ = "wa_journeys"
    __table_args__ = (UniqueConstraint("customer_id", "kind", name="uq_wa_journeys_kind"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # post_purchase | reorder | birthday
    enabled = Column(Boolean, nullable=False, default=False)
    template_id = Column(Integer, ForeignKey("wa_templates.id", ondelete="SET NULL"), nullable=True)
    delay_days = Column(SmallInteger, nullable=False, default=3)  # after delivery (orders)
    send_hour = Column(SmallInteger, nullable=False, default=10)  # local hour to send


class WaJourneyRun(Base):
    """One journey message to one customer, sent once per order (or per year for birthdays)."""

    __tablename__ = "wa_journey_runs"
    __table_args__ = (UniqueConstraint("journey_id", "key", name="uq_wa_journey_runs_key"),)

    id = Column(Integer, primary_key=True)
    journey_id = Column(Integer, ForeignKey("wa_journeys.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(40), nullable=False)  # order:123 | bday:2026
    status = Column(String(10), nullable=False)  # sent | failed | skipped
    note = Column(String(300), nullable=True)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now, index=True)
