"""What a chatbot is made of: its trigger and settings, the canvas graph, and each block's content.

The canvas can save anything structurally sound (a draft may be half-done); `graph.problems()` checks
every block against the models below before a bot can be published.
"""

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.customer.automation.schemas import ReplySchema, _blank

NODE_TYPES = ("start", "message", "buttons", "list", "question", "condition", "action", "handover", "delay",
              "webhook", "goto", "end")
ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
VARIABLE = re.compile(r"^[a-z_][a-z0-9_]{0,39}$")
MAX_DELAY_SECONDS = 12 * 3600  # stays well inside WhatsApp's 24-hour reply window


def _keywords(v: list[str]) -> list[str]:
    return list(dict.fromkeys(" ".join(k.lower().split())[:60] for k in v if k and k.strip()))


def _optional_variable(v):
    v = (v or "").strip().lower().replace(" ", "_") if isinstance(v, str) else v
    if not v:
        return None
    if not VARIABLE.match(v):
        raise ValueError("Name the answer with small letters, digits and _ (e.g. city)")
    return v


# The canvas ---------------------------------------------------------------------------------

class Position(BaseModel):
    x: float = 0
    y: float = 0


class NodeSchema(BaseModel):
    id: str
    type: str
    position: Position = Field(default_factory=Position)
    data: dict = Field(default_factory=dict)

    @field_validator("id")
    @classmethod
    def _id(cls, v):
        if not ID.match(v):
            raise ValueError("Block ids are letters, digits, - and _")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in NODE_TYPES:
            raise ValueError(f"Unknown block type {v}")
        return v


class EdgeSchema(BaseModel):
    id: str = Field(..., max_length=120)
    source: str = Field(..., max_length=40)
    sourceHandle: Optional[str] = Field(None, max_length=60)  # noqa: N815 (the canvas's own name)
    target: str = Field(..., max_length=40)


class GraphSchema(BaseModel):
    nodes: list[NodeSchema] = Field(default_factory=list, max_length=150)
    edges: list[EdgeSchema] = Field(default_factory=list, max_length=400)

    @model_validator(mode="after")
    def _unique(self):
        if len({n.id for n in self.nodes}) != len(self.nodes):
            raise ValueError("Two blocks have the same id")
        return self


# Blocks -------------------------------------------------------------------------------------

class MessageData(BaseModel):
    reply: ReplySchema

    @model_validator(mode="after")
    def _plain(self):
        if self.reply.type in ("buttons", "list"):
            raise ValueError("Use a Buttons or List block to ask for a choice")
        return self


class Choice(BaseModel):
    id: str = Field(..., min_length=1, max_length=12)
    title: str = Field(..., min_length=1, max_length=20)

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, v):
        return v.strip() if isinstance(v, str) else v


class ButtonsData(BaseModel):
    text: str = Field(..., min_length=1, max_length=1024)
    header_type: Literal["none", "text", "image", "video", "document"] = "none"
    header: Optional[str] = Field(None, max_length=60)
    media_key: Optional[str] = Field(None, max_length=80)
    media_filename: Optional[str] = Field(None, max_length=255)
    footer: Optional[str] = Field(None, max_length=60)
    buttons: list[Choice] = Field(..., min_length=1, max_length=3)
    variable: Optional[str] = Field(None, max_length=40)  # also keep the tapped button's text as {{variable}}

    @field_validator("variable", mode="before")
    @classmethod
    def _variable(cls, v):
        return _optional_variable(v)

    @field_validator("text", "header", "footer", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @model_validator(mode="after")
    def _check(self):
        if len({b.title.lower() for b in self.buttons}) != len(self.buttons):
            raise ValueError("Two buttons can't have the same text")
        if len({b.id for b in self.buttons}) != len(self.buttons):
            raise ValueError("Two buttons have the same id")
        if self.header_type == "text" and not self.header:
            raise ValueError("Write the header or choose no header")
        if self.header_type in ("image", "video", "document") and not self.media_key:
            raise ValueError("Upload the header file")
        return self


class Row(BaseModel):
    id: str = Field(..., min_length=1, max_length=12)
    title: str = Field(..., min_length=1, max_length=24)
    description: Optional[str] = Field(None, max_length=72)

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)


class Section(BaseModel):
    title: Optional[str] = Field(None, max_length=24)
    rows: list[Row] = Field(..., min_length=1, max_length=10)

    @field_validator("title", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)


class ListData(BaseModel):
    text: str = Field(..., min_length=1, max_length=1024)
    header: Optional[str] = Field(None, max_length=60)
    footer: Optional[str] = Field(None, max_length=60)
    button: str = Field(..., min_length=1, max_length=20)
    sections: list[Section] = Field(..., min_length=1, max_length=10)
    variable: Optional[str] = Field(None, max_length=40)  # also keep the chosen option's title as {{variable}}

    @field_validator("variable", mode="before")
    @classmethod
    def _variable(cls, v):
        return _optional_variable(v)

    @field_validator("text", "header", "footer", "button", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @model_validator(mode="after")
    def _check(self):
        rows = [r for s in self.sections for r in s.rows]
        if len(rows) > 10:
            raise ValueError("A list can have at most 10 options in all")
        if len({r.title.lower() for r in rows}) != len(rows):
            raise ValueError("Two options can't have the same title")
        if len({r.id for r in rows}) != len(rows):
            raise ValueError("Two options have the same id")
        if len(self.sections) > 1 and not all(s.title for s in self.sections):
            raise ValueError("Give every section a title (needed when there's more than one)")
        return self


class QuestionData(BaseModel):
    text: str = Field(..., min_length=1, max_length=1024)
    kind: Literal["text", "number", "email", "phone", "date", "media"] = "text"
    variable: str = Field(..., min_length=1, max_length=40)
    save_to: Literal["none", "name", "email", "attribute"] = "none"  # also keep it on the contact
    min: Optional[float] = None
    max: Optional[float] = None
    retry_text: Optional[str] = Field(None, max_length=1024)

    @field_validator("text", "retry_text", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @field_validator("variable", mode="before")
    @classmethod
    def _variable(cls, v):
        v = (v or "").strip().lower().replace(" ", "_") if isinstance(v, str) else v
        if not VARIABLE.match(v or ""):
            raise ValueError("Name the answer with small letters, digits and _ (e.g. city)")
        return v

    @model_validator(mode="after")
    def _range(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("The smallest number is bigger than the largest")
        return self


CONDITION_OPS = ("equals", "not_equals", "contains", "not_contains", "starts_with", "is_set", "is_empty",
                 "gt", "lt", "has", "not_has", "open", "closed")
FIELDS = re.compile(r"^(var:[a-z_][a-z0-9_]{0,39}|contact:(name|email|phone|opted_out)|attr:[a-z0-9_ -]{1,40}"
                    r"|tags|message|office_hours)$")


class ConditionRule(BaseModel):
    field: str = Field(..., max_length=60)  # var:city | contact:name | attr:plan | tags | message | office_hours
    op: Literal[CONDITION_OPS]  # type: ignore[valid-type]
    value: Optional[str] = Field(None, max_length=200)

    @field_validator("field")
    @classmethod
    def _field(cls, v):
        if not FIELDS.match(v):
            raise ValueError("Choose what to check")
        return v

    @model_validator(mode="after")
    def _value(self):
        needs = self.op in ("equals", "not_equals", "contains", "not_contains", "starts_with", "gt", "lt", "has",
                            "not_has")
        if needs and (self.value is None or not self.value.strip()):
            raise ValueError("Enter the value to compare with")
        if self.op in ("gt", "lt"):
            try:
                float(self.value)
            except (TypeError, ValueError):
                raise ValueError("Bigger / smaller than needs a number") from None
        return self


class ConditionData(BaseModel):
    match: Literal["all", "any"] = "all"
    rules: list[ConditionRule] = Field(..., min_length=1, max_length=10)


class Action(BaseModel):
    type: Literal["add_tags", "remove_tags", "set_attribute", "set_name", "set_email", "set_variable",
                  "opt_out", "opt_in", "resolve"]
    tags: list[str] = Field(default_factory=list, max_length=20)
    key: Optional[str] = Field(None, max_length=40)
    value: Optional[str] = Field(None, max_length=500)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v):
        return list(dict.fromkeys(t.strip()[:40] for t in v if t and t.strip()))

    @model_validator(mode="after")
    def _check(self):
        if self.type in ("add_tags", "remove_tags") and not self.tags:
            raise ValueError("Choose at least one tag")
        if self.type in ("set_attribute", "set_variable") and not (self.key and self.key.strip()):
            raise ValueError("Enter the field name")
        if self.type == "set_variable" and not VARIABLE.match(self.key.strip().lower()):
            raise ValueError("Name it with small letters, digits and _")
        if self.type in ("set_name", "set_email", "set_attribute", "set_variable") and self.value is None:
            raise ValueError("Enter the value")
        return self


class ActionData(BaseModel):
    actions: list[Action] = Field(..., min_length=1, max_length=10)


class HandoverData(BaseModel):
    text: Optional[str] = Field(None, max_length=1024)
    assign: Literal["auto", "member", "team", "nobody"] = "auto"  # auto = your assignment rules
    member_id: Optional[int] = None
    team_id: Optional[int] = None

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @model_validator(mode="after")
    def _who(self):
        if self.assign == "member" and not self.member_id:
            raise ValueError("Choose who gets the chat")
        if self.assign == "team" and not self.team_id:
            raise ValueError("Choose the team")
        return self


UNIT_SECONDS = {"seconds": 1, "minutes": 60, "hours": 3600}


class DelayData(BaseModel):
    amount: int = Field(..., ge=1, le=720)
    unit: Literal["seconds", "minutes", "hours"] = "seconds"

    @model_validator(mode="after")
    def _limit(self):
        if self.seconds > MAX_DELAY_SECONDS:
            raise ValueError("Wait at most 12 hours")
        return self

    @property
    def seconds(self) -> int:
        return self.amount * UNIT_SECONDS[self.unit]


class Header(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: str = Field("", max_length=1000)


class SaveValue(BaseModel):
    path: str = Field(..., min_length=1, max_length=200)  # e.g. data.order.status
    variable: str = Field(..., min_length=1, max_length=40)

    @field_validator("variable", mode="before")
    @classmethod
    def _variable(cls, v):
        v = (v or "").strip().lower() if isinstance(v, str) else v
        if not VARIABLE.match(v or ""):
            raise ValueError("Name it with small letters, digits and _")
        return v


class WebhookData(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "POST"
    url: str = Field(..., max_length=1000)
    headers: list[Header] = Field(default_factory=list, max_length=10)
    body: Optional[str] = Field(None, max_length=5000)
    save: list[SaveValue] = Field(default_factory=list, max_length=10)

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        v = v.strip()
        if not re.match(r"^https?://[^\s/$.?#][^\s]*$", v, re.I):
            raise ValueError("Enter a full address starting with https://")
        return v


class GotoData(BaseModel):
    chatbot_id: int


class EndData(BaseModel):
    text: Optional[str] = Field(None, max_length=1024)
    resolve: bool = False  # mark the chat resolved

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)


NODE_DATA: dict[str, type[BaseModel] | None] = {
    "start": None, "message": MessageData, "buttons": ButtonsData, "list": ListData, "question": QuestionData,
    "condition": ConditionData, "action": ActionData, "handover": HandoverData, "delay": DelayData,
    "webhook": WebhookData, "goto": GotoData, "end": EndData,
}


# The bot ------------------------------------------------------------------------------------

class BotSettings(BaseModel):
    timeout_minutes: int = Field(30, ge=1, le=1440)  # the bot gives up when the person goes quiet this long
    timeout_text: Optional[str] = Field(None, max_length=1024)
    invalid_text: Optional[str] = Field("Sorry, I didn't get that. Please choose one of the options.",
                                        max_length=1024)
    max_retries: int = Field(2, ge=0, le=5)
    on_fail: Literal["handover", "end"] = "handover"  # after too many wrong answers
    exit_keywords: list[str] = Field(default_factory=lambda: ["agent", "human", "talk to agent"], max_length=20)
    handover_text: Optional[str] = Field("Connecting you to our team. Someone will reply shortly.",
                                         max_length=1024)

    @field_validator("timeout_text", "invalid_text", "handover_text", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @field_validator("exit_keywords")
    @classmethod
    def _kw(cls, v):
        return _keywords(v)


class ChatbotSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=300)
    trigger: Literal["keyword", "new_chat", "any", "ad", "manual"] = "keyword"
    match: Literal["exact", "contains", "starts_with"] = "exact"
    keywords: list[str] = Field(default_factory=list, max_length=50)
    restart_minutes: int = Field(0, ge=0, le=60 * 24 * 30)
    settings: BotSettings = Field(default_factory=BotSettings)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v) if isinstance(v, str) else v

    @field_validator("keywords")
    @classmethod
    def _kw(cls, v):
        return _keywords(v)

    @model_validator(mode="after")
    def _keywords_needed(self):
        if self.trigger == "keyword" and not self.keywords:
            raise ValueError("Add at least one keyword that starts the chatbot")
        return self


class CreateSchema(ChatbotSchema):
    starter: Optional[str] = Field(None, max_length=40)  # a ready-made flow to begin with (see starters.py)


class SaveGraphSchema(BaseModel):
    graph: GraphSchema


class ImportSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    bot: ChatbotSchema
    graph: GraphSchema


class SimInput(BaseModel):
    text: Optional[str] = Field(None, max_length=4096)
    reply_id: Optional[str] = Field(None, max_length=120)  # a tapped button / list option
    media: bool = False  # the tester "sent" a photo or file


class SimContact(BaseModel):
    name: str = Field("Asha Verma", max_length=150)
    phone: str = Field("919800000000", max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    tags: list[str] = Field(default_factory=list, max_length=50)
    attributes: dict = Field(default_factory=dict)


class SimulateSchema(BaseModel):
    """One step of a test chat. The page keeps `state` and sends it back with the next message."""

    graph: Optional[GraphSchema] = None  # what's on the canvas now (saved or not)
    settings: Optional[BotSettings] = None
    state: Optional[dict] = None
    input: Optional[SimInput] = None
    contact: SimContact = Field(default_factory=SimContact)


class StartInChatSchema(BaseModel):
    conversation_id: int
