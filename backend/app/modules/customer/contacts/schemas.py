from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

MAX_ATTRIBUTES = 30


def clean_tags(tags: list[str] | None) -> list[str]:
    seen: dict[str, None] = {}
    for tag in tags or []:
        tag = str(tag).strip()[:40]
        if tag:
            seen.setdefault(tag, None)
    return list(seen)[:30]


def clean_attributes(attrs: dict | None) -> dict[str, str]:
    """Custom fields: short keys, string values, empty values dropped."""
    out: dict[str, str] = {}
    for key, value in (attrs or {}).items():
        key = str(key).strip().lower().replace(" ", "_")[:40]
        value = "" if value is None else str(value).strip()[:500]
        if key and value:
            out[key] = value
    return dict(list(out.items())[:MAX_ATTRIBUTES])


class ContactSchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=25)
    name: Optional[str] = Field(None, max_length=150)
    email: Optional[EmailStr] = None
    tags: list[str] = Field(default_factory=list, max_length=30)
    attributes: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    opted_out: bool = False
    blocked: bool = False

    @field_validator("name", "email", mode="before")
    @classmethod
    def _blank(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("tags")
    @classmethod
    def _tags(cls, v):
        return clean_tags(v)

    @field_validator("attributes")
    @classmethod
    def _attrs(cls, v):
        return clean_attributes(v)


class BulkSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=1000)
    action: Literal["delete", "add_tag", "remove_tag", "opt_out", "opt_in", "block", "unblock"]
    tag: Optional[str] = Field(None, max_length=40)

    @field_validator("tag")
    @classmethod
    def _tag(cls, v):
        return v.strip() or None if isinstance(v, str) else v
