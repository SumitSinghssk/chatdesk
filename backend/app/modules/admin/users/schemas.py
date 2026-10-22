from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.enums import Status


class UserBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    role_id: Optional[int] = None
    status: Status = Status.ACTIVE
    bio: Optional[str] = Field(None, max_length=2000)
    avatar: Optional[str] = Field(None, max_length=500)
    social_links: Optional[dict[str, Optional[str]]] = None
    permission_ids: list[int] = Field(default_factory=list, max_length=500)
    password: Optional[str] = Field(None, max_length=72)
    password_confirmation: Optional[str] = Field(None, max_length=72)

    @field_validator("social_links")
    @classmethod
    def http_urls(cls, links: Optional[dict[str, Optional[str]]]):
        if not links:
            return links
        cleaned = {}
        for key, value in links.items():
            value = (value or "").strip()
            if value and (len(value) > 500 or not value.lower().startswith(("http://", "https://"))):
                raise ValueError(f"{key}: enter a full URL starting with http:// or https://")
            cleaned[key[:50]] = value or None
        return cleaned


class UserCreateSchema(UserBaseSchema):
    password: str = Field(..., min_length=1, max_length=72)


class UserUpdateSchema(UserBaseSchema):
    pass
