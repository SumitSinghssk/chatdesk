from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class AiConnection(Base, TimestampMixin):
    """An AI provider key the business brings (Claude, ChatGPT, Gemini, Groq, ... or any OpenAI-compatible API).

    The key is stored encrypted and only ever shown masked.
    """

    __tablename__ = "ai_connections"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)  # see providers.PROVIDERS
    label = Column(String(80), nullable=False)
    api_key = Column(Text, nullable=False)  # encrypted
    key_hint = Column(String(20), nullable=False)  # e.g. "sk-ant…a1b2"
    base_url = Column(String(300), nullable=True)  # "custom" (and optional override for the others)
    status = Column(String(10), nullable=False, default="unchecked")  # ok | failed | unchecked
    error = Column(String(300), nullable=True)
    checked_at = Column(DateTime, nullable=True)
    models = Column(JSON, nullable=False, default=list)  # model ids the key can use (from the provider)
    # optional prices for providers we don't know, USD per 1M tokens: {"model": [input, output]}
    prices = Column(JSON, nullable=False, default=dict)


class AiAgent(Base, TimestampMixin):
    """An AI assistant: who it is, what it knows, and where it answers (WhatsApp, a website, the API)."""

    __tablename__ = "ai_agents"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    connection_id = Column(Integer, ForeignKey("ai_connections.id", ondelete="SET NULL"), nullable=True)
    model = Column(String(120), nullable=True)
    # persona, tone, language, scope, instructions, important facts, handover... (schemas.Behaviour)
    behaviour = Column(JSON, nullable=False, default=dict)
    # WhatsApp: on/off, when it answers, pause after a person replies (schemas.WhatsAppChannel)
    whatsapp = Column(JSON, nullable=False, default=dict)
    whatsapp_enabled = Column(Boolean, nullable=False, default=False)
    # website widget look and rules (schemas.WidgetChannel)
    widget = Column(JSON, nullable=False, default=dict)
    widget_enabled = Column(Boolean, nullable=False, default=False)
    api_enabled = Column(Boolean, nullable=False, default=False)
    public_key = Column(String(40), nullable=False, unique=True)  # in the website script; not a secret
    secret_key = Column(Text, nullable=True)  # encrypted; for server-to-server API calls
    secret_hint = Column(String(20), nullable=True)
    limits = Column(JSON, nullable=False, default=dict)  # monthly budget, memory size, reply length
    # knowledge: bumps on every training; answers cached for an older version are never used
    knowledge_version = Column(Integer, nullable=False, default=0)
    trained_at = Column(DateTime, nullable=True)
    knowledge_tokens = Column(Integer, nullable=False, default=0)
    needs_training = Column(Boolean, nullable=False, default=False)
    created_by = Column(String(150), nullable=True)


class AiSource(Base, TimestampMixin):
    """One piece of knowledge: a file, a web page, a note or a question with its answer."""

    __tablename__ = "ai_sources"
    __table_args__ = (Index("ix_ai_sources_agent_kind", "agent_id", "kind"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(10), nullable=False)  # file | url | text | faq
    title = Column(String(300), nullable=False)  # file name, page title, note title, or the question
    filename = Column(String(255), nullable=True)
    mime = Column(String(120), nullable=True)
    size = Column(Integer, nullable=True)
    path = Column(String(300), nullable=True)  # the original file under storage/ai-knowledge
    url = Column(String(1000), nullable=True)
    content = Column(Text, nullable=True)  # text read from it once (the answer, for an faq)
    pages = Column(Integer, nullable=True)
    chars = Column(Integer, nullable=False, default=0)
    tokens = Column(Integer, nullable=False, default=0)
    status = Column(String(10), nullable=False, default="ready")  # ready | failed
    error = Column(String(300), nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    trained = Column(Boolean, nullable=False, default=False)  # in the current training
    created_by = Column(String(150), nullable=True)


class AiChunk(Base):
    """A searchable passage of a source, made when the agent is trained."""

    __tablename__ = "ai_chunks"
    __table_args__ = (Index("ix_ai_chunks_agent_position", "agent_id", "source_id", "position"),)

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    source_id = Column(Integer, ForeignKey("ai_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    heading = Column(String(300), nullable=True)
    text = Column(Text, nullable=False)
    tokens = Column(Integer, nullable=False, default=0)


class AiThread(Base):
    """One conversation with the agent: a WhatsApp chat, a website visitor, an API caller or the test chat.

    `summary` is its long-term memory: older messages folded into a few lines, so every reply
    remembers the whole conversation without sending all of it again.
    """

    __tablename__ = "ai_threads"
    __table_args__ = (
        Index("ix_ai_threads_agent_last", "agent_id", "last_message_at"),
        Index("ix_ai_threads_pending", "pending_at"),
    )

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    channel = Column(String(10), nullable=False)  # whatsapp | web | api | test
    token = Column(String(64), nullable=True, unique=True)  # web/api: proves the visitor owns the thread
    conversation_id = Column(Integer, ForeignKey("wa_conversations.id", ondelete="CASCADE"), nullable=True,
                             index=True)
    contact_id = Column(Integer, ForeignKey("wa_contacts.id", ondelete="SET NULL"), nullable=True)
    visitor = Column(JSON, nullable=False, default=dict)  # name, phone, email, page, host
    status = Column(String(10), nullable=False, default="active")  # active | handover | paused
    handover_reason = Column(String(300), nullable=True)
    handover_at = Column(DateTime, nullable=True)
    summary = Column(Text, nullable=True)
    summary_upto = Column(Integer, nullable=True)  # last message id folded into the summary
    pending_at = Column(DateTime, nullable=True)  # WhatsApp: a customer message is waiting for an answer
    resumed_at = Column(DateTime, nullable=True)  # turned back on by hand: earlier team replies don't pause it
    messages_count = Column(Integer, nullable=False, default=0)
    last_message_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


class AiMessage(Base):
    """A message in a thread. The agent's replies carry what they cost and where the answer came from."""

    __tablename__ = "ai_messages"
    __table_args__ = (
        Index("ix_ai_messages_thread", "thread_id", "id"),
        Index("ix_ai_messages_agent_created", "agent_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("ai_threads.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(10), nullable=False)  # user | assistant
    text = Column(Text, nullable=False)
    # assistant: answered | handover | unknown (didn't know) | failed | cached
    outcome = Column(String(10), nullable=True)
    sources = Column(JSON, nullable=False, default=list)  # [{"id", "title", "kind"}]
    model = Column(String(120), nullable=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cached_tokens = Column(Integer, nullable=False, default=0)  # input read from the provider's cache
    cost = Column(Float, nullable=False, default=0.0)  # USD, estimated
    saved = Column(Float, nullable=False, default=0.0)  # USD the caches saved
    latency_ms = Column(Integer, nullable=True)
    feedback = Column(String(5), nullable=True)  # up | down
    error = Column(String(300), nullable=True)
    wa_message_id = Column(Integer, ForeignKey("wa_messages.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)


class AiAnswerCache(Base):
    """A reply to a stand-alone question, reused when someone asks the same thing again (no AI call)."""

    __tablename__ = "ai_answer_cache"
    __table_args__ = (Index("ix_ai_answer_cache_lookup", "agent_id", "version", "key", unique=True),)

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)  # knowledge + behaviour version it was made with
    channel = Column(String(10), nullable=False)  # whatsapp and web format text differently
    key = Column(String(64), nullable=False)
    question = Column(String(500), nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(JSON, nullable=False, default=list)
    hits = Column(Integer, nullable=False, default=0)
    saved_cost = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, nullable=False, default=now)
