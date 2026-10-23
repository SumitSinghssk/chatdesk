from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WaChatbot(Base, TimestampMixin):
    """A chatbot: a flow of messages, questions and branches drawn on the canvas.

    `graph` is the draft being edited; `published_graph` is what customers get. Publishing copies the
    draft over, so half-finished edits never reach a live chat.
    """

    __tablename__ = "wa_chatbots"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(String(300), nullable=True)
    # what starts it: keyword | new_chat | any | ad | manual (from the inbox, an auto-reply or another bot)
    trigger = Column(String(20), nullable=False, default="keyword")
    match = Column(String(20), nullable=False, default="exact")  # exact | contains | starts_with
    keywords = Column(JSON, nullable=False, default=list)
    restart_minutes = Column(Integer, nullable=False, default=0)  # "any" bots: at most once per person in this time
    # timeout, retries, exit keywords, messages (see schemas.BotSettings)
    settings = Column(JSON, nullable=False, default=dict)
    graph = Column(JSON, nullable=False, default=dict)  # {"nodes": [...], "edges": [...]} as on the canvas
    published_graph = Column(JSON, nullable=True)
    published_settings = Column(JSON, nullable=True)
    published_at = Column(DateTime, nullable=True)
    version = Column(Integer, nullable=False, default=0)  # +1 on every publish
    active = Column(Boolean, nullable=False, default=False)
    # WhatsApp media ids of the files its messages send: {media_key: [media_id, uploaded iso]}
    media_cache = Column(JSON, nullable=False, default=dict)
    created_by = Column(String(150), nullable=True)


class WaChatbotSession(Base):
    """One person going through a chatbot, from the first message to where it ended."""

    __tablename__ = "wa_chatbot_sessions"
    __table_args__ = (
        Index("ix_wa_chatbot_sessions_conversation_status", "conversation_id", "status"),
        Index("ix_wa_chatbot_sessions_bot_started", "chatbot_id", "started_at"),
        Index("ix_wa_chatbot_sessions_status_resume", "status", "resume_at"),
    )

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    chatbot_id = Column(Integer, ForeignKey("wa_chatbots.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=0)  # the published version it runs
    status = Column(String(20), nullable=False, default="active")  # active | ended
    # ended: completed | handover | timeout | stopped | agent | opted_out | replaced | failed
    end_reason = Column(String(20), nullable=True)
    node_id = Column(String(40), nullable=True)  # where it waits (a reply, or the node after a delay)
    wait = Column(String(10), nullable=True)  # reply | delay
    resume_at = Column(DateTime, nullable=True)  # delay: when to carry on
    retries = Column(Integer, nullable=False, default=0)
    variables = Column(JSON, nullable=False, default=dict)  # answers and API values, used as {{name}}
    trail = Column(JSON, nullable=False, default=list)  # [[node_id, handle taken]] for the report
    trigger = Column(String(20), nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False)
    last_activity_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
