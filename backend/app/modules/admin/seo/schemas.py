from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _blank_to_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class FaqSchema(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=5000)


class SeoPageBaseSchema(BaseModel):
    page: str = Field(..., min_length=1, max_length=150)
    path: str = Field(..., min_length=1, max_length=500)
    meta_title: Optional[str] = Field(None, max_length=255)
    meta_description: Optional[str] = Field(None, max_length=500)
    meta_keywords: Optional[str] = Field(None, max_length=500)
    og_image: Optional[str] = Field(None, max_length=500)
    canonical_url: Optional[str] = Field(None, max_length=1000)
    schema_markup: Optional[str] = Field(None, max_length=100_000)
    header_scripts: Optional[str] = Field(None, max_length=100_000)
    footer_scripts: Optional[str] = Field(None, max_length=100_000)
    custom_css: Optional[str] = Field(None, max_length=100_000)
    faqs: list[FaqSchema] = Field(default_factory=list, max_length=100)
    allow_indexing: bool = True

    @field_validator("meta_title", "meta_description", "meta_keywords", "og_image", "canonical_url",
                     "schema_markup", "header_scripts", "footer_scripts", "custom_css", mode="before")
    @classmethod
    def _blank(cls, v):
        return _blank_to_none(v)

    @field_validator("page", "path", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("faqs", mode="before")
    @classmethod
    def _null_faqs(cls, v):
        return [] if v is None else v


class SeoPageCreateSchema(SeoPageBaseSchema):
    pass


class SeoPageUpdateSchema(SeoPageBaseSchema):
    pass
