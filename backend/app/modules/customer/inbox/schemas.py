from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SendTextSchema(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    reply_to_id: Optional[int] = None

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Type a message")
        return v


class TemplateParam(BaseModel):
    text: str = Field(..., min_length=1, max_length=1024)


class SendTemplateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    language: str = Field(..., min_length=2, max_length=15)
    body_params: list[TemplateParam] = Field(default_factory=list, max_length=20)
    header_params: list[TemplateParam] = Field(default_factory=list, max_length=1)
    preview: Optional[str] = Field(None, max_length=4096)  # rendered text, shown in the chat


class StatusSchema(BaseModel):
    status: Literal["open", "pending", "resolved"]


class NoteSchema(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Write a note")
        return v.strip()


class ContactUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    tags: Optional[list[str]] = Field(None, max_length=30)
    opted_out: Optional[bool] = None
    blocked: Optional[bool] = None

    @field_validator("name", mode="before")
    @classmethod
    def _blank_name(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v):
        if v is None:
            return v
        seen: dict[str, None] = {}
        for tag in v:
            tag = tag.strip()[:40]
            if tag:
                seen.setdefault(tag, None)
        return list(seen)


class QuickReplySchema(BaseModel):
    shortcut: str = Field(..., min_length=1, max_length=40)
    text: str = Field(..., min_length=1, max_length=4096)

    @field_validator("shortcut")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lstrip("/").strip().lower().replace(" ", "-")
        if not v:
            raise ValueError("Add a shortcut, e.g. thanks")
        return v

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Write the reply text")
        return v.strip()


class StartConversationSchema(BaseModel):
    phone: str = Field(..., min_length=8, max_length=20)
    name: Optional[str] = Field(None, max_length=150)

    @field_validator("phone")
    @classmethod
    def _digits(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if not 8 <= len(digits) <= 15:
            raise ValueError("Enter the number with its country code, e.g. 919876543210")
        return digits
