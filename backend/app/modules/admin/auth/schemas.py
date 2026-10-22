from typing import Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginSchema(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    remember: bool = False


class TwoFactorChallengeSchema(BaseModel):
    two_factor_token: str
    code: Optional[str] = Field(None, max_length=10)
    recovery_code: Optional[str] = Field(None, max_length=20)

    @model_validator(mode="after")
    def one_of(self):
        if not self.code and not self.recovery_code:
            raise ValueError("Enter the 6-digit code or a recovery code")
        return self


class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    token: str = Field(..., min_length=10)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    password_confirmation: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match")
        return self
