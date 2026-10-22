from typing import Literal

from pydantic import BaseModel, Field, field_validator


class NotFoundRedirectSchema(BaseModel):

    id: int
    target_url: str = Field(..., min_length=1, max_length=2048)
    status_code: Literal[301, 302, 307, 308] = 301

    @field_validator("target_url", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v
