from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class WaContact(Base, TimestampMixin):
    """A person who chats with a business on WhatsApp (one row per business + phone)."""

    __tablename__ = "wa_contacts"
    __table_args__ = (UniqueConstraint("customer_id", "wa_id", name="uq_wa_contacts_customer_wa_id"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    wa_id = Column(String(32), nullable=False)  # phone in international format, digits only
    name = Column(String(150), nullable=True)  # name the business saved
    profile_name = Column(String(150), nullable=True)  # name from the person's WhatsApp profile
    email = Column(String(255), nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    attributes = Column(JSON, nullable=False, default=dict, server_default="{}")  # custom fields, e.g. city
    source = Column(String(20), nullable=False, default="inbox", server_default="inbox")  # inbox|manual|import|api
    opted_out = Column(Boolean, nullable=False, default=False)
    blocked = Column(Boolean, nullable=False, default=False)
    last_message_at = Column(DateTime, nullable=True)

    conversation = relationship("WaConversation", back_populates="contact", uselist=False,
                                cascade="all, delete-orphan", passive_deletes=True)


class WaConversation(Base, TimestampMixin):
    """The chat thread with one contact. Status works like a helpdesk ticket."""

    __tablename__ = "wa_conversations"
    __table_args__ = (Index("ix_wa_conversations_customer_last", "customer_id", "last_message_at"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="open")  # open | pending | resolved
    unread_count = Column(Integer, nullable=False, default=0)
    last_message_at = Column(DateTime, nullable=True)
    last_message_preview = Column(String(255), nullable=True)
    last_message_direction = Column(String(3), nullable=True)  # in | out
    last_message_type = Column(String(30), nullable=True)  # lets the list show the right icon
    last_inbound_at = Column(DateTime, nullable=True)  # starts the 24-hour customer service window
    resolved_at = Column(DateTime, nullable=True)
    # Team: who handles the chat (a member of the workspace) and which team it belongs to
    assignee_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("wa_teams.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_at = Column(DateTime, nullable=True)
    waiting_since = Column(DateTime, nullable=True)  # oldest customer message nobody has answered yet
    # Snooze: hidden from the queues until this time, then back on top with a reminder. A customer message
    # wakes it early unless snooze_keep. snooze_woke_at marks "came back" until someone handles the chat.
    snoozed_until = Column(DateTime, nullable=True, index=True)
    snooze_note = Column(String(200), nullable=True)
    snoozed_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    snooze_keep = Column(Boolean, nullable=False, default=False, server_default="false")
    snooze_woke_at = Column(DateTime, nullable=True)

    contact = relationship("WaContact", back_populates="conversation")
    assignee = relationship("Customer", foreign_keys=[assignee_id])
    team = relationship("WaTeam")
    messages = relationship("WaMessage", back_populates="conversation", cascade="all, delete-orphan",
                            passive_deletes=True)
    notes = relationship("WaNote", back_populates="conversation", cascade="all, delete-orphan",
                         passive_deletes=True)


class WaMessage(Base):
    """One WhatsApp message in either direction, with its delivery status."""

    __tablename__ = "wa_messages"
    __table_args__ = (
        Index("uq_wa_messages_wamid", "wamid", unique=True, postgresql_where=text("wamid IS NOT NULL")),
        Index("ix_wa_messages_conversation_id_id", "conversation_id", "id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False)
    wamid = Column(String(255), nullable=True)  # Meta's message id
    direction = Column(String(3), nullable=False)  # in | out
    type = Column(String(30), nullable=False, default="text")
    text = Column(Text, nullable=True)  # body, caption, button title, template preview…
    media_id = Column(String(128), nullable=True)
    media_mime = Column(String(120), nullable=True)
    media_filename = Column(String(255), nullable=True)
    media_size = Column(Integer, nullable=True)  # bytes, once known
    context_wamid = Column(String(255), nullable=True)  # the message this one replies to
    template_name = Column(String(255), nullable=True)
    payload = Column(JSON, nullable=True)  # raw message from Meta (location, contacts, referral…)
    status = Column(String(20), nullable=False, default="received")  # received|pending|sent|delivered|read|failed
    error_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    sent_by = Column(String(150), nullable=True)  # who replied from the workspace
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=now)
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

    conversation = relationship("WaConversation", back_populates="messages")


class WaNote(Base):
    """Internal note on a conversation. Never sent to the contact."""

    __tablename__ = "wa_notes"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    body = Column(Text, nullable=False)
    author = Column(String(150), nullable=True)
    # who wrote it (they and managers may edit or delete it); empty for notes from before this existed
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
    edited_at = Column(DateTime, nullable=True)

    conversation = relationship("WaConversation", back_populates="notes")


class WaPresence(Base):
    """Who has a chat open right now and what they're doing, so two people don't answer the same customer.

    Browsers send a heartbeat every few seconds; a row older than presence.FRESH means they've gone.
    """

    __tablename__ = "wa_presence"
    __table_args__ = (UniqueConstraint("conversation_id", "member_id", name="uq_wa_presence_conversation_member"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    state = Column(String(10), nullable=False, default="viewing")  # viewing | reply | note
    updated_at = Column(DateTime, nullable=False, default=now, index=True)


class WaQuickReply(Base, TimestampMixin):
    """A saved answer agents insert by typing "/" + shortcut in the composer."""

    __tablename__ = "wa_quick_replies"
    __table_args__ = (UniqueConstraint("customer_id", "shortcut", name="uq_wa_quick_replies_shortcut"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    shortcut = Column(String(40), nullable=False)
    text = Column(Text, nullable=False)


class WaConversationEvent(Base):
    """Something that happened to a chat (assigned, moved to a team, resolved…), shown in its timeline."""

    __tablename__ = "wa_conversation_events"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    kind = Column(String(20), nullable=False)  # assigned | unassigned | team | status
    text = Column(String(255), nullable=False)
    actor = Column(String(150), nullable=True)  # who did it; empty for automatic assignment
    created_at = Column(DateTime, nullable=False, default=now)


class WaResponse(Base):
    """How long a customer waited for a reply (one row per answered wait), for response-time reports."""

    __tablename__ = "wa_responses"
    __table_args__ = (Index("ix_wa_responses_customer_created", "customer_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    seconds = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=now)


class WaConversationPin(Base):
    """A chat pinned to the top of the list: for one person (member_id) or for everyone (member_id empty)."""

    __tablename__ = "wa_conversation_pins"
    __table_args__ = (
        Index("uq_wa_conversation_pins_member", "conversation_id", "member_id", unique=True,
              postgresql_where=text("member_id IS NOT NULL")),
        Index("uq_wa_conversation_pins_everyone", "conversation_id", unique=True,
              postgresql_where=text("member_id IS NULL")),
    )

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


class WaMessageStar(Base):
    """A starred message, shared with the team, with an optional note ("price we agreed", "address")."""

    __tablename__ = "wa_message_stars"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)
