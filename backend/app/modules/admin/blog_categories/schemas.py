from typing import Optional

from pydantic import BaseModel, Field

from app.shared.enums import Status


class BlogCategoryBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    slug: Optional[str] = Field(None, max_length=180)
    parent_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=2000)
    image: Optional[str] = Field(None, max_length=500)
    status: Status = Status.ACTIVE


class BlogCategoryCreateSchema(BlogCategoryBaseSchema):
    pass


class BlogCategoryUpdateSchema(BlogCategoryBaseSchema):
    pass
