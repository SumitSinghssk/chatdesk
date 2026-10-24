"""What an AI agent is set up with: its behaviour, its channels (WhatsApp, website, API) and its limits."""

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.customer.ai_agent.providers import PROVIDERS

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
DOMAIN = re.compile(r"^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$")


def _strip(v):
    return v.strip() if isinstance(v, str) else v


def _words(values: list[str], size: int = 60) -> list[str]:
    return list(dict.fromkeys(" ".join(v.lower().split())[:size] for v in values if v and v.strip()))


class Fact(BaseModel):
    text: str = Field(..., min_length=1, max_length=600)
    _s = field_validator("text", mode="before")(_strip)


class Handover(BaseModel):
    enabled: bool = True
    when_unsure: bool = True  # it can't find the answer
    when_asked: bool = True  # the customer asks for a person
    when_upset: bool = True  # the customer is angry or complaining
    keywords: list[str] = Field(default_factory=lambda: ["agent", "human", "talk to someone"], max_length=30)
    message: str = Field("Let me connect you with our team. Someone will reply here shortly.", max_length=500)
    assign: Literal["auto", "nobody"] = "auto"  # "auto": the inbox's assignment rules

    _k = field_validator("keywords")(lambda v: _words(v))


class Behaviour(BaseModel):
    business_name: str = Field("", max_length=120)
    about: str = Field("", max_length=2000)  # what the business does, in a few lines
    role: str = Field("customer support assistant", max_length=120)
    tone: Literal["friendly", "professional", "casual", "formal"] = "friendly"
    language: str = Field("auto", max_length=40)  # auto = the customer's language
    length: Literal["short", "medium", "detailed"] = "short"
    scope: Literal["strict", "flexible"] = "strict"  # strict: only from its knowledge
    emoji: bool = True
    instructions: str = Field("", max_length=4000)
    facts: list[Fact] = Field(default_factory=list, max_length=60)  # "important things": always known
    unknown_reply: str = Field("Sorry, I don't have that information right now.", max_length=500)
    handover: Handover = Field(default_factory=Handover)
    quality: Literal["fast", "balanced", "best"] = "fast"  # how hard the model thinks
    knowledge_mode: Literal["auto", "full", "search"] = "auto"
    cache_answers: bool = True  # reuse answers to repeated stand-alone questions

    _s = field_validator("business_name", "about", "role", "instructions", "unknown_reply", "language",
                         mode="before")(_strip)


class WhatsAppChannel(BaseModel):
    mode: Literal["always", "outside_hours"] = "always"
    pause_hours: int = Field(12, ge=0, le=168)  # after someone from the team replies (0 = until resolved)
    media_reply: str = Field("I can read text messages only. Please type your question.", max_length=300)


class WidgetChannel(BaseModel):
    title: str = Field("Chat with us", max_length=60)
    subtitle: str = Field("We usually reply instantly", max_length=80)
    greeting: str = Field("Hi! 👋 How can I help you today?", max_length=500)
    color: str = "#16a34a"
    position: Literal["right", "left"] = "right"
    theme: Literal["auto", "light", "dark"] = "auto"
    launcher_text: str = Field("", max_length=30)  # text beside the bubble; empty = icon only
    suggestions: list[str] = Field(default_factory=list, max_length=4)
    lead: Literal["off", "optional", "required"] = "off"  # ask for name / phone / email
    lead_fields: list[Literal["name", "phone", "email"]] = Field(default_factory=lambda: ["name", "phone"])
    whatsapp_button: bool = True  # "Continue on WhatsApp" (uses the connected number)
    allowed_domains: list[str] = Field(default_factory=list, max_length=20)
    branding: bool = True

    @field_validator("color")
    @classmethod
    def _color(cls, v):
        if not HEX.match(v or ""):
            raise ValueError("Pick a colour like #16a34a")
        return v.lower()

    @field_validator("suggestions")
    @classmethod
    def _suggestions(cls, v):
        return [s.strip()[:80] for s in v if s and s.strip()]

    @field_validator("allowed_domains")
    @classmethod
    def _domains(cls, v):
        out = []
        for d in v:
            d = (d or "").strip().lower()
            d = re.sub(r"^https?://", "", d).split("/")[0]
            if not d:
                continue
            if not DOMAIN.match(d):
                raise ValueError(f"\"{d}\" isn't a website address (e.g. example.com or *.example.com)")
            out.append(d)
        return list(dict.fromkeys(out))


class Limits(BaseModel):
    monthly_budget: float = Field(0, ge=0, le=100000)  # USD; 0 = no limit
    memory_messages: int = Field(10, ge=2, le=40)  # recent messages sent word for word
    reply_tokens: int = Field(700, ge=100, le=4000)


class CreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    starter: Literal["support", "sales", "booking", "blank"] = "support"
    connection_id: Optional[int] = None
    model: Optional[str] = Field(None, max_length=120)
    business_name: str = Field("", max_length=120)

    _s = field_validator("name", "business_name", mode="before")(_strip)


class AgentSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    connection_id: Optional[int] = None
    model: Optional[str] = Field(None, max_length=120)
    behaviour: Behaviour
    limits: Limits = Field(default_factory=Limits)

    _s = field_validator("name", mode="before")(_strip)


class ChannelsSchema(BaseModel):
    whatsapp_enabled: bool = False
    whatsapp: WhatsAppChannel = Field(default_factory=WhatsAppChannel)
    widget_enabled: bool = False
    widget: WidgetChannel = Field(default_factory=WidgetChannel)
    api_enabled: bool = False


class ConnectionSchema(BaseModel):
    provider: str
    label: str = Field("", max_length=80)
    api_key: Optional[str] = Field(None, max_length=500)  # leave empty when editing to keep the saved key
    base_url: Optional[str] = Field(None, max_length=300)
    prices: dict[str, list[float]] = Field(default_factory=dict)

    _s = field_validator("label", "api_key", "base_url", mode="before")(_strip)

    @field_validator("provider")
    @classmethod
    def _provider(cls, v):
        if v not in PROVIDERS:
            raise ValueError("Choose an AI provider")
        return v

    @field_validator("base_url")
    @classmethod
    def _url(cls, v):
        if v and not re.match(r"^https?://[^\s/$.?#].[^\s]*$", v):
            raise ValueError("Enter the full address, starting with https://")
        return v.rstrip("/") if v else None

    @field_validator("prices")
    @classmethod
    def _prices(cls, v):
        out = {}
        for model, pair in list(v.items())[:50]:
            if len(pair) != 2 or any(p < 0 or p > 1000 for p in pair):
                raise ValueError("Prices are two numbers: input and output, in USD per 1M tokens")
            out[model.strip()[:120]] = [float(pair[0]), float(pair[1])]
        return out


class TextSourceSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(..., min_length=1, max_length=100_000)

    _s = field_validator("title", "content", mode="before")(_strip)


class FaqSchema(BaseModel):
    question: str = Field(..., min_length=2, max_length=300)
    answer: str = Field(..., min_length=1, max_length=5000)

    _s = field_validator("question", "answer", mode="before")(_strip)


class UrlSourceSchema(BaseModel):
    url: str = Field(..., min_length=4, max_length=1000)
    crawl: bool = False  # also add the pages it links to on the same website
    max_pages: int = Field(10, ge=1, le=30)

    @field_validator("url", mode="before")
    @classmethod
    def _url(cls, v):
        v = (v or "").strip()
        if v and not re.match(r"^https?://", v, re.I):
            v = "https://" + v
        if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", v):
            raise ValueError("Enter a website address like https://example.com/about")
        return v


class SourceUpdateSchema(BaseModel):
    enabled: Optional[bool] = None
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    content: Optional[str] = Field(None, min_length=1, max_length=100_000)  # notes and FAQ answers

    _s = field_validator("title", "content", mode="before")(_strip)


class TestSchema(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    thread_id: Optional[int] = None
    channel: Literal["web", "whatsapp"] = "web"  # how replies are formatted


class FeedbackSchema(BaseModel):
    value: Optional[Literal["up", "down"]] = None


class PublicChatSchema(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    token: Optional[str] = Field(None, max_length=64)
    page: Optional[str] = Field(None, max_length=500)
    host: Optional[str] = Field(None, max_length=200)

    _s = field_validator("message", mode="before")(_strip)


class PublicLeadSchema(BaseModel):
    token: Optional[str] = Field(None, max_length=64)
    name: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=200)
    host: Optional[str] = Field(None, max_length=200)

    _s = field_validator("name", "phone", "email", mode="before")(_strip)


class PublicFeedbackSchema(BaseModel):
    token: str = Field(..., max_length=64)
    message_id: int
    value: Optional[Literal["up", "down"]] = None


class ApiMessageSchema(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    thread: Optional[str] = Field(None, max_length=64)  # the token a previous reply returned
    user: Optional[dict] = None  # {"name", "phone", "email"} of the person, if known

    _s = field_validator("message", mode="before")(_strip)
