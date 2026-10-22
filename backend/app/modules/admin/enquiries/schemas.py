from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.utils.datetime import to_utc
from app.shared.enums import EnquiryStatus

ENQUIRY_SOURCES = (
    "website", "phone-call", "walk-in", "email", "whatsapp", "social-media", "referral", "event", "other",
)
EnquirySource = Literal[
    "website", "phone-call", "walk-in", "email", "whatsapp", "social-media", "referral", "event", "other",
]

BULK_ACTIONS = ("delete", "mark-new", "mark-in_progress", "mark-replied", "mark-on_hold", "mark-closed", "mark-spam")


def blank_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value.strip() if isinstance(value, str) else value


def to_local_naive(value: datetime | None) -> datetime | None:
    return to_utc(value)


class EnquiryContactSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=30)
    company: Optional[str] = Field(None, max_length=150)
    subject: Optional[str] = Field(None, max_length=255)
    message: str = Field(..., min_length=1, max_length=10000)

    @field_validator("email", "phone", "company", "subject", mode="before")
    @classmethod
    def _blank(cls, v):
        return blank_to_none(v)

    @field_validator("name", "message", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class EnquiryCreateSchema(EnquiryContactSchema):
    source: EnquirySource = "phone-call"
    status: Literal["new", "in_progress"] = "new"
    assigned_to: Optional[int] = None
    follow_up_at: Optional[datetime] = None
    note: Optional[str] = Field(None, max_length=5000)

    @field_validator("note", mode="before")
    @classmethod
    def _blank_note(cls, v):
        return blank_to_none(v)

    @field_validator("follow_up_at")
    @classmethod
    def _local(cls, v):
        return to_local_naive(v)


class EnquiryUpdateSchema(EnquiryContactSchema):
    source: Optional[EnquirySource] = None


class EnquiryStatusSchema(BaseModel):
    status: EnquiryStatus
    note: Optional[str] = Field(None, max_length=5000)

    @field_validator("note", mode="before")
    @classmethod
    def _blank_note(cls, v):
        return blank_to_none(v)


class EnquiryNoteSchema(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)

    @field_validator("body", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class EnquiryAssignSchema(BaseModel):
    user_id: Optional[int] = None


class EnquiryFollowUpSchema(BaseModel):
    follow_up_at: Optional[datetime] = None

    @field_validator("follow_up_at")
    @classmethod
    def _local(cls, v):
        return to_local_naive(v)


class EnquiryReplySchema(BaseModel):
    subject: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=20000)
    include_original: bool = False

    @field_validator("subject", "body", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class EnquiryBulkSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)
    action: Literal["delete", "mark-new", "mark-in_progress", "mark-replied", "mark-on_hold", "mark-closed", "mark-spam"]
