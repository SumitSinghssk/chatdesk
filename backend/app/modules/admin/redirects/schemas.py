from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.shared.enums import Status

StatusCode = Literal[301, 302, 307, 308]


class RedirectBaseSchema(BaseModel):
    source_path: str = Field(..., min_length=1, max_length=500)
    target_url: str = Field(..., min_length=1, max_length=2048)
    status_code: StatusCode = 301
    status: Status = Status.ACTIVE
    note: Optional[str] = Field(None, max_length=255)

    @field_validator("source_path", "target_url", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("note", mode="before")
    @classmethod
    def _blank(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class RedirectCreateSchema(RedirectBaseSchema):
    pass


class RedirectUpdateSchema(RedirectBaseSchema):
    pass
