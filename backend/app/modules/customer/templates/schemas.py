from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Category = Literal["marketing", "utility", "authentication"]
HeaderFormat = Literal["none", "text", "image", "video", "document", "location"]
ButtonType = Literal["quick_reply", "url", "phone_number", "copy_code", "otp"]


def _blank(v):
    return v.strip() or None if isinstance(v, str) else v


class HeaderSchema(BaseModel):
    format: HeaderFormat = "none"
    text: Optional[str] = Field(None, max_length=60)
    example: Optional[str] = Field(None, max_length=60)  # sample value for the header's variable

    @field_validator("text", "example", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank(v)


class ButtonSchema(BaseModel):
    type: ButtonType
    text: str = Field("", max_length=25)
    url: Optional[str] = Field(None, max_length=2000)
    phone_number: Optional[str] = Field(None, max_length=20)
    # url: sample value for {{1}} at the end of a dynamic link; copy_code: the sample code
    example: Optional[str] = Field(None, max_length=200)

    @field_validator("url", "phone_number", "example", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank(v)

    @field_validator("text", mode="before")
    @classmethod
    def _text(cls, v):
        return v.strip() if isinstance(v, str) else v or ""


class TemplateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    language: str = Field(..., min_length=2, max_length=15, pattern=r"^[a-z]{2,3}(_[A-Z]{2})?$")
    category: Category
    parameter_format: Literal["positional", "named"] = "positional"
    header: HeaderSchema = Field(default_factory=HeaderSchema)
    body: str = Field("", max_length=1024)
    examples: dict[str, str] = Field(default_factory=dict)  # body variable -> sample value
    footer: Optional[str] = Field(None, max_length=60)
    buttons: list[ButtonSchema] = Field(default_factory=list, max_length=10)
    # authentication templates (Meta writes their text)
    add_security_recommendation: bool = True
    code_expiration_minutes: Optional[int] = Field(None, ge=1, le=90)
    # Header sample: a key from POST /templates/media, or "template:<id>" to copy another template's
    sample_key: Optional[str] = Field(None, max_length=80)
    sample_filename: Optional[str] = Field(None, max_length=255)
    submit: bool = True  # False saves a draft without sending it to Meta

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        # "Order Update!" -> "order_update" (Meta allows lowercase letters, numbers and underscores)
        if not isinstance(v, str):
            return v
        out = "".join(ch if ch.isalnum() else "_" for ch in v.strip().lower())
        return "_".join(part for part in out.split("_") if part)

    @field_validator("footer", mode="before")
    @classmethod
    def _footer(cls, v):
        return _blank(v)

    @field_validator("examples", mode="before")
    @classmethod
    def _examples(cls, v):
        return {str(k): str(val).strip()[:200] for k, val in (v or {}).items() if str(val or "").strip()}

