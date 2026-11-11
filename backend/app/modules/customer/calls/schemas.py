from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _digits(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    digits = "".join(ch for ch in v if ch.isdigit())
    if len(digits) < 8 or len(digits) > 15:
        raise ValueError("Enter the number with its country code, e.g. 919876543210")
    return digits


class RuleSchema(BaseModel):
    """What to send on WhatsApp after a call."""

    on: bool = False
    # Sent while the customer's 24-hour chat window is open. {name}, {business}, {time} and {duration} are
    # filled in. Empty = always use the template.
    text: str = Field("", max_length=1000)
    # Sent when the chat window is closed (or there's no text). Its variables get the same four values.
    template_id: Optional[int] = None

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else v


class ConnectionSchema(BaseModel):
    provider: str = Field("exotel", max_length=30)
    # The provider's fields (services/voice). Secret fields left blank keep the saved value.
    config: dict[str, Optional[str]] = Field(default_factory=dict)


class SettingsSchema(BaseModel):
    answered: RuleSchema = Field(default_factory=RuleSchema)
    missed: RuleSchema = Field(default_factory=RuleSchema)
    min_answered_seconds: int = Field(5, ge=0, le=120)
    record_calls: bool = True
    save_recordings: bool = True
    agent_number: Optional[str] = Field(None, max_length=20)

    _agent = field_validator("agent_number", mode="before")(classmethod(lambda cls, v: _digits(v)))


class StartCallSchema(BaseModel):
    to: str = Field(..., min_length=8, max_length=20)
    # The phone that rings first. Empty = the default agent number in Calls settings.
    agent_number: Optional[str] = Field(None, max_length=20)

    _to = field_validator("to", "agent_number", mode="before")(classmethod(lambda cls, v: _digits(v)))
