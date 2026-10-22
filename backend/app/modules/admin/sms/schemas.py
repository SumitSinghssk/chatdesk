from typing import Optional

from pydantic import BaseModel, Field, field_validator


class SmsTemplateSettingsSchema(BaseModel):
    body: str = Field("", max_length=1000)
    template_ids: dict[str, str] = {}

    @field_validator("template_ids")
    @classmethod
    def _clean_ids(cls, v: dict[str, str]) -> dict[str, str]:
        return {k[:30]: (val or "").strip()[:100] for k, val in v.items() if (val or "").strip()}


class SmsSettingsSchema(BaseModel):
    default_country_code: str = Field("91", pattern=r"^\d{1,4}$")
    order: list[str] = Field(default_factory=list, max_length=20)
    gateways: dict[str, dict[str, Optional[str | bool]]] = {}
    templates: dict[str, SmsTemplateSettingsSchema] = {}

    @field_validator("gateways")
    @classmethod
    def _clean_gateways(cls, v: dict) -> dict:
        cleaned = {}
        for key, values in v.items():
            cleaned[key] = {
                name: value if isinstance(value, bool) or value is None else str(value).strip()[:500]
                for name, value in values.items()
            }
        return cleaned


class SmsTemplatesSchema(BaseModel):
    templates: dict[str, SmsTemplateSettingsSchema]


class SmsTestSchema(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    gateway: Optional[str] = Field(None, max_length=30)
