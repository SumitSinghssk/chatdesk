from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.enums import Status

SOCIAL_PLATFORMS = ("linkedin", "twitter", "facebook", "instagram", "github", "youtube", "website")


class TeamSocialLinkSchema(BaseModel):
    platform: str = Field(..., max_length=30)
    url: str = Field(..., max_length=500)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: str) -> str:
        v = v.strip()
        if not v.lower().startswith(("http://", "https://")):
            raise ValueError("Link must start with http:// or https://")
        return v


class TeamMemberBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    designation: Optional[str] = Field(None, max_length=150)
    department: Optional[str] = Field(None, max_length=150)
    bio: Optional[str] = Field(None, max_length=3000)
    photo: Optional[str] = Field(None, max_length=500)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=30)
    social_links: list[TeamSocialLinkSchema] = Field(default_factory=list, max_length=10)
    is_featured: bool = False
    sort_order: int = Field(0, ge=0, le=65535)
    status: Status = Status.ACTIVE

    @field_validator("designation", "department", "bio", "phone", "email", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class TeamMemberCreateSchema(TeamMemberBaseSchema):
    pass


class TeamMemberUpdateSchema(TeamMemberBaseSchema):
    pass
