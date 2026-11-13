from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

TONES = ("friendly", "professional", "concise", "apologetic")


class AssistSettingsSchema(BaseModel):
    enabled: bool = False
    connection_id: Optional[int] = None
    model: Optional[str] = Field(None, max_length=120)
    agent_id: Optional[int] = None
    monthly_budget: Optional[float] = Field(None, ge=0, le=100_000)

    @field_validator("model", mode="before")
    @classmethod
    def _blank(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class AssistSchema(BaseModel):
    # translate / rewrite: the agent's draft. translate without text = the customer's last message.
    text: Optional[str] = Field(None, max_length=4000)
    language: Optional[str] = Field(None, max_length=40)  # translate: e.g. "Hindi", "English"
    tone: Optional[Literal["friendly", "professional", "concise", "apologetic"]] = None  # rewrite

    @field_validator("text", "language", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() or None if isinstance(v, str) else v
