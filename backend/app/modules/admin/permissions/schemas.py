from typing import Optional

from pydantic import BaseModel, Field


class PermissionCreateSchema(BaseModel):
    name: str = Field(..., min_length=3, max_length=150)
    group: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
