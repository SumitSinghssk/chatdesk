from sqlalchemy import JSON, Column, Float, ForeignKey, Integer, String

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WaSpendSettings(Base, TimestampMixin):
    """Per-category message rates and a monthly budget for the WhatsApp spend meter."""

    __tablename__ = "wa_spend_settings"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    currency = Column(String(3), nullable=False, default="INR")
    rates = Column(JSON, nullable=False, default=dict)  # {"marketing": 0.88, "utility": 0.13, ...}
    monthly_budget = Column(Float, nullable=True)
