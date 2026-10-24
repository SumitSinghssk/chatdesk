from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator


class RegisterSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    business_name: Optional[str] = Field(None, max_length=150)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(..., min_length=1, max_length=128)
    password_confirmation: str = Field(..., max_length=128)

    @field_validator("phone", "business_name", mode="before")
    @classmethod
    def _blank_phone(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("password_confirmation")
    @classmethod
    def _match(cls, v: str, info: ValidationInfo) -> str:
        if v != info.data.get("password"):
            raise ValueError("Passwords don't match")
        return v


class LoginSchema(BaseModel):
    login: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class OtpSendSchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)


class OtpVerifySchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    code: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")
    name: Optional[str] = Field(None, max_length=150)

    @field_validator("name", mode="before")
    @classmethod
    def _blank_name(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class GoogleLoginSchema(BaseModel):
    credential: str = Field(..., min_length=20, max_length=5000)


class TwoFactorChallengeSchema(BaseModel):
    two_factor_token: str = Field(..., max_length=2000)
    code: Optional[str] = Field(None, max_length=10)
    recovery_code: Optional[str] = Field(None, max_length=20)
