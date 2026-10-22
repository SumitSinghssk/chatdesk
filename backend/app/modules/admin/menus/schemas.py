from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

MAX_DEPTH = 3
MAX_ITEMS = 100


class MenuItemInput(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    url: str = Field(..., min_length=1, max_length=2000)
    new_tab: bool = False
    is_active: bool = True
    children: list[MenuItemInput] = Field(default_factory=list)

    @field_validator("label", "url")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


class MenuUpdateSchema(BaseModel):
    items: list[MenuItemInput] = Field(default_factory=list)


MenuItemInput.model_rebuild()
