from datetime import date, datetime
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


class Page(BaseModel):
    id: str = Field(..., min_length=1, max_length=24, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=60)

    _clean = field_validator("name", mode="before")(_strip)


class DiagramUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    folder: Optional[str] = Field(None, max_length=60)
    pages: Optional[list[Page]] = Field(None, min_length=1, max_length=50)

    @field_validator("pages")
    @classmethod
    def _unique(cls, v):
        if v is not None and len({p.id for p in v}) != len(v):
            raise ValueError("Each page needs its own id")
        return v

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
    page: Optional[str] = Field(None, max_length=24)
    x: Optional[float] = None
    y: Optional[float] = None
    parent_id: Optional[int] = None
    mentions: list[int] = Field(default_factory=list, max_length=20)  # team members to notify

    _clean = field_validator("body", mode="before")(_strip)


class GuestCommentSchema(CommentSchema):
    name: str = Field(..., min_length=1, max_length=60)

    _clean_name = field_validator("name", mode="before")(_strip)


class ResolveSchema(BaseModel):
    resolved: bool


class DrawSchema(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=4000)
    kind: Literal["any", "flowchart", "mindmap"] = "any"
    connection_id: Optional[int] = None
    model: Optional[str] = Field(None, max_length=120)

    _clean = field_validator("prompt", mode="before")(_strip)


class EmbedSchema(BaseModel):
    enabled: bool
    new_code: bool = False  # a new address; pages showing the old one stop showing it


class TaskSchema(BaseModel):
    """Makes a comment a task (or changes it); no one to do it turns it back into a plain comment."""

    assignee_id: Optional[int] = None
    due_on: Optional[date] = None


class VersionSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)

    _clean = field_validator("name", mode="before")(_strip)


class UnlockSchema(BaseModel):
    password: str = Field(..., min_length=1, max_length=100)


class TimerSchema(BaseModel):
    minutes: int = Field(..., ge=0, le=60)  # 0 stops it


class VotingSchema(BaseModel):
    open: bool
    per_person: int = Field(3, ge=1, le=10)
    reset: bool = False  # clear the votes from last time


class VoteSchema(BaseModel):
    node_id: str = Field(..., min_length=1, max_length=64)
    on: bool = True


class ChangeRequestSchema(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
