from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.customer.inbox.schemas import LocationParam

Segment = Literal["sent", "delivered", "read", "not_read", "replied", "not_replied", "clicked", "failed"]


class AudienceSchema(BaseModel):
    """Who receives the campaign."""

    type: Literal["all", "tags", "contacts", "campaign"] = "all"
    tags: list[str] = Field(default_factory=list, max_length=50)
    tag_match: Literal["any", "all"] = "any"  # contacts with any of the tags, or every tag
    exclude_tags: list[str] = Field(default_factory=list, max_length=50)
    contact_ids: list[int] = Field(default_factory=list, max_length=100_000)
    # retargeting: people from an earlier campaign who, e.g., read it but didn't reply
    campaign_id: Optional[int] = None
    segment: Optional[Segment] = None

    @field_validator("tags", "exclude_tags")
    @classmethod
    def _tags(cls, v):
        return list(dict.fromkeys(t.strip() for t in v if t and t.strip()))


class VariableSource(BaseModel):
    """Where one template variable gets its value for each person."""

    source: Literal["name", "first_name", "phone", "email", "attribute", "static"] = "static"
    value: Optional[str] = Field(None, max_length=500)  # attribute key, or the static text
    fallback: Optional[str] = Field(None, max_length=200)  # used when the contact has no value

    @field_validator("value", "fallback", mode="before")
    @classmethod
    def _blank(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class VariablesSchema(BaseModel):
    header: dict[str, VariableSource] = Field(default_factory=dict)
    body: dict[str, VariableSource] = Field(default_factory=dict)
    buttons: dict[str, VariableSource] = Field(default_factory=dict)  # button index -> value


class CampaignSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    template_id: int
    audience: AudienceSchema = Field(default_factory=AudienceSchema)
    variables: VariablesSchema = Field(default_factory=VariablesSchema)
    header_media: Optional[str] = Field(None, max_length=80)
    location: Optional[LocationParam] = None
    # draft: save only · now: start sending · schedule: send at `scheduled_at`
    action: Literal["draft", "now", "schedule"] = "draft"
    scheduled_at: Optional[datetime] = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return v.strip() if isinstance(v, str) else v


class PreviewSchema(BaseModel):
    """Audience size, cost and sample messages before sending."""

    template_id: int
    audience: AudienceSchema = Field(default_factory=AudienceSchema)
    variables: VariablesSchema = Field(default_factory=VariablesSchema)


class TestSendSchema(BaseModel):
    template_id: int
    variables: VariablesSchema = Field(default_factory=VariablesSchema)
    header_media: Optional[str] = Field(None, max_length=80)
    location: Optional[LocationParam] = None
    phone: str = Field(..., min_length=6, max_length=25)
