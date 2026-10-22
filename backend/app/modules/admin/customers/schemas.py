from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.enums import Status


class CustomerBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    password: Optional[str] = Field(None, max_length=128)
    status: Status = Status.ACTIVE
    business_name: Optional[str] = Field(None, max_length=150)

    @field_validator("email", "phone", "password", "business_name", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class CustomerCreateSchema(CustomerBaseSchema):
    pass


class CustomerUpdateSchema(CustomerBaseSchema):
    pass
