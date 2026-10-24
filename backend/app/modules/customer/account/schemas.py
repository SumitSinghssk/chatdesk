from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator


class ProfileUpdateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    business_name: Optional[str] = Field(None, max_length=150)
    email: Optional[EmailStr] = None  # changing it goes through /account/email (a code to the new address)
    job_title: Optional[str] = Field(None, max_length=100)

    @field_validator("email", "business_name", "job_title", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class PasswordUpdateSchema(BaseModel):
    current_password: Optional[str] = Field(None, max_length=128)
    password: str = Field(..., min_length=1, max_length=128)
    password_confirmation: str = Field(..., max_length=128)

    @field_validator("password_confirmation")
    @classmethod
    def _match(cls, v: str, info: ValidationInfo) -> str:
        if v != info.data.get("password"):
            raise ValueError("Passwords don't match")
        return v


class PhoneSendSchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)


class PhoneVerifySchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    code: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


class EmailChangeSchema(BaseModel):
    email: EmailStr
    password: Optional[str] = Field(None, max_length=128)


class EmailVerifySchema(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d+$")


class TwoFactorCodeSchema(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)


class IdentitySchema(BaseModel):
    """The password, or a two-step code for accounts without a password."""
    password: Optional[str] = Field(None, max_length=128)
    code: Optional[str] = Field(None, max_length=10)


class GoogleLinkSchema(BaseModel):
    credential: str = Field(..., min_length=10, max_length=5000)


class ReadSchema(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=500)
    all: bool = False


class DeleteAccountSchema(IdentitySchema):
    confirm: str = Field(..., max_length=40)  # must be DELETE (owners) or LEAVE (team members)
