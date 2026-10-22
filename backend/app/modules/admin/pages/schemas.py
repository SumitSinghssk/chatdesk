from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.admin.blogs.schemas import to_local_naive
from app.shared.enums import PublishStatus


class PageBaseSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=280)
    content: Optional[str] = None
    featured_image: Optional[str] = Field(None, max_length=500)
    status: PublishStatus = PublishStatus.DRAFT
    published_at: Optional[datetime] = None
    meta_title: Optional[str] = Field(None, max_length=255)
    meta_description: Optional[str] = Field(None, max_length=500)

    @field_validator("published_at")
    @classmethod
    def _local_tz(cls, value):
        return to_local_naive(value)


class PageCreateSchema(PageBaseSchema):
    pass


class PageUpdateSchema(PageBaseSchema):
    pass
