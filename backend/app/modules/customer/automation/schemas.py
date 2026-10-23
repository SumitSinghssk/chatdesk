import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _blank(v):
    return v.strip() or None if isinstance(v, str) else v


class ListRow(BaseModel):
    title: str = Field(..., min_length=1, max_length=24)
    description: Optional[str] = Field(None, max_length=72)

    @field_validator("title", "description", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank(v)


class ReplySchema(BaseModel):
    """What an automatic reply sends (WhatsApp's limits are checked here)."""

    type: Literal["text", "media", "buttons", "list", "location"] = "text"
    text: Optional[str] = Field(None, max_length=4096)  # message, caption, or body of buttons/list
    # media: a file from POST /templates/media
    media_key: Optional[str] = Field(None, max_length=80)
    media_kind: Optional[Literal["image", "video", "document"]] = None
    media_filename: Optional[str] = Field(None, max_length=255)
    # buttons (up to 3) / list (up to 10 rows)
    header: Optional[str] = Field(None, max_length=60)
    footer: Optional[str] = Field(None, max_length=60)
    buttons: list[str] = Field(default_factory=list, max_length=3)
    list_button: Optional[str] = Field(None, max_length=20)
    rows: list[ListRow] = Field(default_factory=list, max_length=10)
    # location
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    place: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=300)

    @field_validator("text", "header", "footer", "list_button", "place", "address", "media_filename",
                     mode="before")
    @classmethod
    def _strip(cls, v):
        return _blank(v)

    @field_validator("buttons")
    @classmethod
    def _buttons(cls, v):
        out = [b.strip() for b in v if b and b.strip()]
        if any(len(b) > 20 for b in out):
            raise ValueError("Button text can be at most 20 characters")
        if len({b.lower() for b in out}) != len(out):
            raise ValueError("Two buttons can't have the same text")
        return out

    @model_validator(mode="after")
    def _complete(self):
        need_text = {"text": "Write the message", "buttons": "Write the message above the buttons",
                     "list": "Write the message above the list"}
        if self.type in need_text and not self.text:
            raise ValueError(need_text[self.type])
        if self.type == "media" and not (self.media_key and self.media_kind):
            raise ValueError("Upload the file to send")
        if self.type == "buttons" and not self.buttons:
            raise ValueError("Add at least one button")
        if self.type == "list" and not self.rows:
            raise ValueError("Add at least one option to the list")
        if self.type == "location" and (self.latitude is None or self.longitude is None):
            raise ValueError("Enter the latitude and longitude")
        return self


class RuleSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    trigger: Literal["keyword", "welcome", "away", "default"] = "keyword"
    match: Literal["exact", "contains", "starts_with"] = "contains"
    keywords: list[str] = Field(default_factory=list, max_length=50)
    reply: ReplySchema
    cooldown_minutes: int = Field(0, ge=0, le=60 * 24 * 30)
    active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("keywords")
    @classmethod
    def _keywords(cls, v):
        return list(dict.fromkeys(k.strip().lower()[:60] for k in v if k and k.strip()))

    @model_validator(mode="after")
    def _keywords_needed(self):
        if self.trigger == "keyword" and not self.keywords:
            raise ValueError("Add at least one keyword")
        return self


class OrderSchema(BaseModel):
    ids: list[int] = Field(..., max_length=500)


class DayHours(BaseModel):
    open: bool = True
    start: str = "09:00"
    end: str = "18:00"

    @field_validator("start", "end")
    @classmethod
    def _time(cls, v):
        if not TIME.match(v):
            raise ValueError("Use a time like 09:30")
        return v


def _default_days() -> dict[str, DayHours]:
    return {d: DayHours(open=d not in ("sun",)) for d in DAYS}


class SettingsSchema(BaseModel):
    timezone: str = Field("Asia/Kolkata", max_length=60)
    hours: dict[str, DayHours] = Field(default_factory=_default_days)
    away_when_nobody_available: bool = False  # also send the away reply when every member is Away
    opt_out_keywords: list[str] = Field(default_factory=lambda: ["stop", "unsubscribe", "stop promotions"])
    opt_out_reply: Optional[str] = Field("You won't get promotional messages from us any more. Reply START to "
                                         "subscribe again.", max_length=1024)
    opt_in_keywords: list[str] = Field(default_factory=lambda: ["start", "subscribe"])
    opt_in_reply: Optional[str] = Field("Welcome back! You'll get our updates and offers again.", max_length=1024)

    @field_validator("hours")
    @classmethod
    def _days(cls, v):
        return {d: v.get(d, DayHours(open=False)) for d in DAYS}

    @field_validator("opt_out_keywords", "opt_in_keywords")
    @classmethod
    def _kw(cls, v):
        return list(dict.fromkeys(k.strip().lower()[:60] for k in v if k and k.strip()))[:20]

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown time zone") from None
        return v

    @field_validator("opt_out_reply", "opt_in_reply", mode="before")
    @classmethod
    def _reply(cls, v):
        return _blank(v)


class TryMessageSchema(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    first_message: bool = False
