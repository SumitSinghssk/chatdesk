from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator


class InviteSchema(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(None, max_length=150)
    role: Literal["admin", "agent"] = "agent"
    team_ids: list[int] = Field(default_factory=list, max_length=50)

    @field_validator("name", mode="before")
    @classmethod
    def _blank(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class MemberUpdateSchema(BaseModel):
    role: Literal["admin", "agent"]
    team_ids: list[int] = Field(default_factory=list, max_length=50)


class AvailabilitySchema(BaseModel):
    availability: Literal["available", "away"]


class TeamSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    description: Optional[str] = Field(None, max_length=255)
    member_ids: list[int] = Field(default_factory=list, max_length=500)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() or None if isinstance(v, str) else v


class SettingsSchema(BaseModel):
    auto_assign: Literal["off", "round_robin"] = "off"
    assign_team_id: Optional[int] = None
    only_available: bool = True
    max_open: Optional[int] = Field(None, ge=1, le=1000)
    agent_visibility: Literal["all", "assigned", "own"] = "all"


class AcceptInviteSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    password: str = Field(..., min_length=1, max_length=128)
    password_confirmation: str = Field(..., max_length=128)

    @field_validator("password_confirmation")
    @classmethod
    def _match(cls, v: str, info: ValidationInfo) -> str:
        if v != info.data.get("password"):
            raise ValueError("Passwords don't match")
        return v


class AssignSchema(BaseModel):
    assignee_id: Optional[int] = None
    team_id: Optional[int] = None
