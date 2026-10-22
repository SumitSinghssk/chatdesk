from typing import Optional

from pydantic import BaseModel, Field


class RoleBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    requires_two_factor: bool = False
    permission_ids: list[int] = Field(default_factory=list, max_length=500)


class RoleCreateSchema(RoleBaseSchema):
    pass


class RoleUpdateSchema(RoleBaseSchema):
    pass


class TogglePermissionSchema(BaseModel):
    permission_id: int
