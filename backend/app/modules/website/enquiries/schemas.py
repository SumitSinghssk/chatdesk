from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class ContactFormSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=30)
    company: Optional[str] = Field(None, max_length=150)
    subject: Optional[str] = Field(None, max_length=255)
    message: str = Field(..., min_length=5, max_length=5000)
    source_url: Optional[str] = Field(None, max_length=1000)
    website: Optional[str] = None
    started_at: Optional[int] = None

    @field_validator("email", "phone", "company", "subject", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("source_url", mode="before")
    @classmethod
    def safe_source_url(cls, v):
        if not isinstance(v, str):
            return None
        v = v.strip()
        if v.lower().startswith(("http://", "https://")) or (v.startswith("/") and not v.startswith("//")):
            return v[:1000]
        return None

    @model_validator(mode="after")
    def contact_required(self):
        if not self.email and not self.phone:
            raise ValueError("Please provide an email address or phone number")
        return self
