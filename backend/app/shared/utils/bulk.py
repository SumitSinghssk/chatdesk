from typing import Literal

from pydantic import BaseModel, Field


class BulkActionSchema(BaseModel):

    ids: list[int] = Field(..., min_length=1, max_length=500)
    action: Literal["activate", "deactivate", "delete"]


class IdsSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)


class ReorderSchema(BaseModel):

    ids: list[int] = Field(..., min_length=1, max_length=1000)
