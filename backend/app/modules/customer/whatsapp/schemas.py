from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ConnectionSchema(BaseModel):
    waba_id: str = Field(..., min_length=5, max_length=64)
    phone_number_id: str = Field(..., min_length=5, max_length=64)
    # Blank on edit = keep the saved value
    access_token: Optional[str] = Field(None, max_length=1000)
    app_secret: Optional[str] = Field(None, max_length=255)

    @field_validator("waba_id", "phone_number_id", "access_token", "app_secret", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class TestMessageSchema(BaseModel):
    to: str = Field(..., min_length=8, max_length=20)
    text: str = Field("Hello from our WhatsApp workspace!", min_length=1, max_length=1000)

    @field_validator("to")
    @classmethod
    def _digits(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 8:
            raise ValueError("Enter the number with its country code, e.g. 919876543210")
        return digits
