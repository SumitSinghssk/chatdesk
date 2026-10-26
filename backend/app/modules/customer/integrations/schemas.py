from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.customer.contacts.schemas import clean_attributes, clean_tags


def _strip(v):
    return v.strip() or None if isinstance(v, str) else v


# Dashboard ------------------------------------------------------------------------------

class ApiKeySchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    _s = field_validator("name", mode="before")(_strip)


class EndpointSchema(BaseModel):
    url: str = Field(..., min_length=8, max_length=500)
    description: Optional[str] = Field(None, max_length=200)
    events: list[str] = Field(..., min_length=1, max_length=50)
    enabled: bool = True
    _s = field_validator("url", "description", mode="before")(_strip)

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        if not v.lower().startswith(("https://", "http://")):
            raise ValueError("Start the URL with https://")
        return v

    @field_validator("events")
    @classmethod
    def _events(cls, v: list[str]) -> list[str]:
        from app.modules.customer.integrations.webhooks import ALL, EVENTS

        unknown = [e for e in v if e != ALL and e not in EVENTS]
        if unknown:
            raise ValueError(f"Unknown event: {unknown[0]}")
        return [ALL] if ALL in v else list(dict.fromkeys(v))


class TestEventSchema(BaseModel):
    event: str = Field("message.received", max_length=40)


# Public API -----------------------------------------------------------------------------

class TemplateButton(BaseModel):
    index: int = Field(..., ge=0, le=9)
    text: str = Field(..., min_length=1, max_length=2000)


class TemplatePart(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    language: str = Field("en", min_length=2, max_length=15)
    header: list[str] = Field(default_factory=list, max_length=1)
    body: list[str] = Field(default_factory=list, max_length=100)
    buttons: list[TemplateButton] = Field(default_factory=list, max_length=10)
    header_media_url: Optional[str] = Field(None, max_length=1000)


class MediaPart(BaseModel):
    url: str = Field(..., min_length=8, max_length=1000)
    caption: Optional[str] = Field(None, max_length=1024)
    filename: Optional[str] = Field(None, max_length=200)


class SendMessageSchema(BaseModel):
    to: str = Field(..., min_length=6, max_length=25, description="Phone number with country code")
    type: Literal["text", "template", "image", "video", "audio", "document"] = "text"
    text: Optional[str] = Field(None, max_length=4096)
    template: Optional[TemplatePart] = None
    media: Optional[MediaPart] = None
    name: Optional[str] = Field(None, max_length=150, description="Saved as the contact's name if they're new")
    reply_to: Optional[str] = Field(None, max_length=255, description="wamid of the message to reply to")

    @field_validator("text", "name", mode="before")
    @classmethod
    def _blank(cls, v):
        return _strip(v)


class ApiContactSchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=25)
    name: Optional[str] = Field(None, max_length=150)
    email: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = Field(None, max_length=30)
    attributes: Optional[dict[str, str | int | float | bool | None]] = None
    opted_out: Optional[bool] = None
    _s = field_validator("name", "email", mode="before")(_strip)
    _t = field_validator("tags")(lambda v: clean_tags(v) if v is not None else v)
    _a = field_validator("attributes")(lambda v: clean_attributes(v) if v is not None else v)


class ApiContactUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    email: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = Field(None, max_length=30, description="Replaces all tags")
    add_tags: list[str] = Field(default_factory=list, max_length=30)
    remove_tags: list[str] = Field(default_factory=list, max_length=30)
    attributes: Optional[dict[str, str | int | float | bool | None]] = Field(
        None, description="Merged into the saved ones; send a field as null to remove it")
    opted_out: Optional[bool] = None
    blocked: Optional[bool] = None
    _s = field_validator("name", "email", mode="before")(_strip)
    _t = field_validator("tags")(lambda v: clean_tags(v) if v is not None else v)
