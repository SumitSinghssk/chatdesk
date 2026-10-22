from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.admin.security.firewall import valid_rule

DURATIONS: dict[str, int | None] = {"1h": 60, "1d": 1440, "1w": 10080, "forever": None}


class IpBlockCreateSchema(BaseModel):
    ip: str = Field(..., min_length=2, max_length=64)
    reason: Optional[str] = Field(None, max_length=200)
    duration: Literal["1h", "1d", "1w", "forever"] = "forever"

    @field_validator("ip", mode="before")
    @classmethod
    def _ip(cls, v):
        v = v.strip() if isinstance(v, str) else v
        if isinstance(v, str) and not valid_rule(v):
            raise ValueError("Enter an IP address like 203.0.113.7, or a range like 203.0.113.0/24.")
        return v

    @field_validator("reason", mode="before")
    @classmethod
    def _reason(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v
