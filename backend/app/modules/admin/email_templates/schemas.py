from pydantic import BaseModel, Field

from app.modules.admin.email_templates.definitions import LIMITS


class TemplateFieldsSchema(BaseModel):
    subject: str | None = Field(None, max_length=LIMITS["subject"])
    heading: str | None = Field(None, max_length=LIMITS["heading"])
    body: str | None = Field(None, max_length=LIMITS["body"])
    button: str | None = Field(None, max_length=LIMITS["button"])
    note: str | None = Field(None, max_length=LIMITS["note"])


class TemplateUpdateSchema(TemplateFieldsSchema):
    enabled: bool | None = None


class TemplatePreviewSchema(BaseModel):
    values: TemplateFieldsSchema | None = None


class EmailDesignSchema(BaseModel):
    accent: str = Field(..., pattern=r"^#[0-9a-fA-F]{6}$")
    footer: str | None = Field("", max_length=200)
    show_logo: bool = True
