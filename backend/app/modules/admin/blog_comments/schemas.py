from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.enums import CommentStatus

MAX_BODY = 3000


def clean_body(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    text = "\n".join(lines).strip()
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text


class CommentUpdateSchema(BaseModel):
    author_name: str = Field(..., min_length=2, max_length=120)
    author_email: Optional[EmailStr] = None
    body: str = Field(..., min_length=2, max_length=MAX_BODY)

    @field_validator("author_name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("author_email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("body")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_body(v)


class CommentStatusSchema(BaseModel):
    status: CommentStatus


class CommentReplySchema(BaseModel):
    body: str = Field(..., min_length=2, max_length=MAX_BODY)

    @field_validator("body")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_body(v)


class CommentBulkSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)
    action: Literal["approve", "reject", "spam", "pending", "delete"]
