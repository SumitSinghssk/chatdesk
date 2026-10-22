from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from app.shared.enums import Status


class GalleryBaseSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=280)
    description: Optional[str] = Field(None, max_length=2000)
    event_date: Optional[date] = None
    cover_image: Optional[str] = Field(None, max_length=500)
    is_featured: bool = False
    sort_order: int = Field(0, ge=0, le=65535)
    status: Status = Status.ACTIVE


class GalleryCreateSchema(GalleryBaseSchema):
    pass


class GalleryUpdateSchema(GalleryBaseSchema):
    pass


class GalleryYoutubeSchema(BaseModel):
    url: str = Field(..., min_length=5, max_length=500)
    title: Optional[str] = Field(None, max_length=255)
    caption: Optional[str] = Field(None, max_length=2000)


class GalleryItemUpdateSchema(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    caption: Optional[str] = Field(None, max_length=2000)


class GalleryCoverSchema(BaseModel):
    item_id: int
