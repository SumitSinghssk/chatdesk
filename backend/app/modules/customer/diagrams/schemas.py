from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Access = Literal["edit", "comment", "view"]


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class DiagramSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    folder: Optional[str] = Field(None, max_length=60)
    # a template's shapes and lines to start from
    content: Optional[dict] = None

    _clean = field_validator("name", "folder", mode="before")(_strip)

    @field_validator("folder")
    @classmethod
    def _folder(cls, v):
        return v or None


class DiagramUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    folder: Optional[str] = Field(None, max_length=60)

    _clean = field_validator("name", "folder", mode="before")(_strip)


class MemberAccess(BaseModel):
    member_id: int
    role: Access


class AccessSchema(BaseModel):
    """Who in the workspace can do what."""

    team_access: Literal["edit", "comment", "view", "private"]
    members: list[MemberAccess] = Field(default_factory=list, max_length=200)


class LinkSchema(BaseModel):
    """The share link for people outside the workspace. They can view, or view and comment, never edit."""

    enabled: bool
    access: Literal["view", "comment"] = "view"
    # None: keep the current password · "": remove it · text: set it
    password: Optional[str] = Field(None, max_length=100)
    expires_at: Optional[datetime] = None
    new_link: bool = False  # a new address; the old one stops working


class Op(BaseModel):
    """One change: a shape (k="n") or a line (k="e") put in whole, or removed (v=None)."""

    k: Literal["n", "e"]
    id: str = Field(..., min_length=1, max_length=64)
    v: Optional[dict] = None


class OpsSchema(BaseModel):
    client_id: Optional[str] = Field(None, max_length=40)
    ops: list[Op] = Field(..., min_length=1, max_length=1000)


class CommentSchema(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    node_id: Optional[str] = Field(None, max_length=64)
    x: Optional[float] = None
    y: Optional[float] = None
    parent_id: Optional[int] = None

    _clean = field_validator("body", mode="before")(_strip)


class GuestCommentSchema(CommentSchema):
    name: str = Field(..., min_length=1, max_length=60)

    _clean_name = field_validator("name", mode="before")(_strip)


class ResolveSchema(BaseModel):
    resolved: bool


class VersionSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)

    _clean = field_validator("name", mode="before")(_strip)


class UnlockSchema(BaseModel):
    password: str = Field(..., min_length=1, max_length=100)
