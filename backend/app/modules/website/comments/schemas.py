from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modules.admin.blog_comments.schemas import MAX_BODY, clean_body


class CommentSubmitSchema(BaseModel):
    author_name: str = Field(..., min_length=2, max_length=120)
    author_email: EmailStr
    body: str = Field(..., min_length=2, max_length=MAX_BODY)
    parent_id: Optional[int] = None
    website: Optional[str] = None
    started_at: Optional[int] = None

    @field_validator("author_name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return " ".join(v.split()) if isinstance(v, str) else v

    @field_validator("body")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = clean_body(v)
        if len(v) < 2:
            raise ValueError("Please write a comment")
        return v
