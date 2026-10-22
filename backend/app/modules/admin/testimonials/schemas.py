from typing import Optional

from pydantic import BaseModel, Field

from app.shared.enums import Status


class TestimonialBaseSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    designation: Optional[str] = Field(None, max_length=150)
    company: Optional[str] = Field(None, max_length=150)
    quote: str = Field(..., min_length=10, max_length=2000)
    photo: Optional[str] = Field(None, max_length=500)
    rating: Optional[int] = Field(None, ge=1, le=5)
    is_featured: bool = False
    sort_order: int = Field(0, ge=0, le=65535)
    status: Status = Status.ACTIVE


class TestimonialCreateSchema(TestimonialBaseSchema):
    pass


class TestimonialUpdateSchema(TestimonialBaseSchema):
    pass
