from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.shared.utils.datetime import to_utc
from app.shared.enums import PublishStatus


def to_local_naive(value: datetime | None) -> datetime | None:
    return to_utc(value)


class BlogBaseSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=280)
    excerpt: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    featured_image: Optional[str] = Field(None, max_length=500)
    status: PublishStatus = PublishStatus.DRAFT
    published_at: Optional[datetime] = None
    meta_title: Optional[str] = Field(None, max_length=255)
    meta_description: Optional[str] = Field(None, max_length=500)
    category_ids: list[int] = Field(default_factory=list, max_length=100)
    comments_enabled: bool = True

    @field_validator("published_at")
    @classmethod
    def _local_tz(cls, value):
        return to_local_naive(value)


class BlogCreateSchema(BlogBaseSchema):
    pass


class BlogUpdateSchema(BlogBaseSchema):
    pass
