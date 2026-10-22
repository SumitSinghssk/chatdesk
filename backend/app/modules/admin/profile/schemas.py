from typing import Optional

from pydantic import BaseModel, Field, field_validator


class SocialLinksSchema(BaseModel):
    twitter: Optional[str] = Field(None, max_length=500)
    linkedin: Optional[str] = Field(None, max_length=500)
    github: Optional[str] = Field(None, max_length=500)
    instagram: Optional[str] = Field(None, max_length=500)
    facebook: Optional[str] = Field(None, max_length=500)
    youtube: Optional[str] = Field(None, max_length=500)

    @field_validator("*")
    @classmethod
    def http_url(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip()
        if not value:
            return None
        if not value.startswith(("http://", "https://")):
            raise ValueError("Enter a full URL starting with http:// or https://")
        return value


class ProfileUpdateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = Field(None, max_length=2000)
    social_links: SocialLinksSchema = Field(default_factory=SocialLinksSchema)


class ChangePasswordSchema(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=1, max_length=72)
    password_confirmation: str = Field(..., max_length=72)


class TwoFactorCodeSchema(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)


class PasswordConfirmSchema(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)
