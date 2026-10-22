from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WaCampaign(Base, TimestampMixin):
    """A broadcast: one approved template sent to a chosen audience, now or at a set time."""

    __tablename__ = "wa_campaigns"
    __table_args__ = (Index("ix_wa_campaigns_due", "status", "scheduled_at"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    template_id = Column(Integer, ForeignKey("wa_templates.id", ondelete="SET NULL"), nullable=True)
    # kept even if the template is deleted later, for the report
    template_name = Column(String(512), nullable=False)
    template_language = Column(String(15), nullable=False)
    template_category = Column(String(20), nullable=True)
    # who gets it: {"type": "all" | "tags" | "contacts" | "campaign", ...} (see schemas.AudienceSchema)
    audience = Column(JSON, nullable=False, default=dict)
    # where each variable's value comes from: {"header": {...}, "body": {...}, "buttons": {...}}
    variables = Column(JSON, nullable=False, default=dict)
    header_media = Column(String(80), nullable=True)  # a file uploaded for this campaign (else the template's)
    location = Column(JSON, nullable=True)
    # draft | scheduled | sending | paused | completed | cancelled | failed
    status = Column(String(20), nullable=False, default="draft", index=True)
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    heartbeat_at = Column(DateTime, nullable=True)  # the sender is alive; a stale one is resumed elsewhere
    error = Column(Text, nullable=True)
    total = Column(Integer, nullable=False, default=0)  # recipients when sending started
    skipped = Column(Integer, nullable=False, default=0)  # opted out, blocked or duplicate numbers
    created_by = Column(String(150), nullable=True)

    recipients = relationship("WaCampaignRecipient", back_populates="campaign", cascade="all, delete-orphan",
                              passive_deletes=True)


class WaCampaignRecipient(Base):
    """One person in a campaign. Delivery, read and reply come from the message it created."""

    __tablename__ = "wa_campaign_recipients"
    __table_args__ = (
        UniqueConstraint("campaign_id", "contact_id", name="uq_wa_campaign_recipients_contact"),
        Index("ix_wa_campaign_recipients_campaign_status", "campaign_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("wa_campaigns.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | sent | failed | skipped
    error = Column(String(500), nullable=True)
    sent_at = Column(DateTime, nullable=True)

    campaign = relationship("WaCampaign", back_populates="recipients")
    contact = relationship("WaContact")
    message = relationship("WaMessage")
