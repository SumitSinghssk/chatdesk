from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class AiAssistSettings(Base, TimestampMixin):
    """AI help for the team in the inbox (suggest a reply, summarize, translate, rewrite), per number."""

    __tablename__ = "ai_assist_settings"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=False)
    connection_id = Column(Integer, ForeignKey("ai_connections.id", ondelete="SET NULL"), nullable=True)
    model = Column(String(120), nullable=True)
    # optional: suggested replies use this agent's instructions, facts and knowledge
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="SET NULL"), nullable=True)
    monthly_budget = Column(Float, nullable=True)  # USD; empty = no limit


class AiAssistUse(Base):
    """One AI assist call, for the monthly budget and the usage report."""

    __tablename__ = "ai_assist_uses"
    __table_args__ = (Index("ix_ai_assist_uses_customer_created", "customer_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(20), nullable=False)  # suggest | summarize | translate | rewrite
    model = Column(String(120), nullable=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost = Column(Float, nullable=False, default=0.0)  # USD, 0 when the price isn't known
    created_at = Column(DateTime, nullable=False, default=now)
