import html
import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared.utils.datetime import iso, to_utc


_IFRAME_TAG = re.compile(r"<iframe\b([^>]*)>", re.IGNORECASE)
_IFRAME_ATTR = re.compile(r"""([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?""")
_IFRAME_KEEP = {"width", "height", "title", "loading", "referrerpolicy", "style"}
_IFRAME_FLAGS = {"allowfullscreen"}


def clean_map_iframe(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    tags = _IFRAME_TAG.findall(value)
    if len(tags) != 1 or len(re.findall(r"<[a-zA-Z]", value)) != 1:
        raise ValueError("Paste a single <iframe> embed code")
    attrs: dict[str, str | None] = {}
    for name, dq, sq, bare in _IFRAME_ATTR.findall(tags[0]):
        attrs[name.lower()] = html.unescape(dq or sq or bare)
    src = (attrs.get("src") or "").strip()
    if not src.lower().startswith("https://"):
        raise ValueError("The map embed must use an https:// address")
    parts = [f'src="{html.escape(src, quote=True)}"']
    for name in sorted(_IFRAME_KEEP):
        val = attrs.get(name)
        if not val:
            continue
        if name == "style" and re.search(r"url\s*\(|expression|javascript:", val, re.IGNORECASE):
            continue
        parts.append(f'{name}="{html.escape(val, quote=True)}"')
    parts.extend(flag for flag in sorted(_IFRAME_FLAGS) if flag in attrs)
    return f"<iframe {' '.join(parts)}></iframe>"


class AddressSchema(BaseModel):
    label: str = Field("", max_length=100)
    text: str = Field("", max_length=500)
    map_iframe: Optional[str] = Field(None, max_length=5000)

    @field_validator("map_iframe")
    @classmethod
    def validate_map_iframe(cls, v):
        return clean_map_iframe(v)


class SocialLinkSchema(BaseModel):
    platform: str = Field(..., max_length=50)
    url: str = Field(..., max_length=500)


class GeneralSettingsSchema(BaseModel):
    app_name: str = Field(..., min_length=1, max_length=150)
    tagline: str = Field("", max_length=255)
    logo_light: Optional[str] = Field(None, max_length=500)
    logo_dark: Optional[str] = Field(None, max_length=500)
    favicon: Optional[str] = Field(None, max_length=500)
    addresses: list[AddressSchema] = []
    phones: list[str] = []
    emails: list[str] = []
    social_links: list[SocialLinkSchema] = []
    footer_text: str = Field("", max_length=500)


class DateTimeSettingsSchema(BaseModel):
    timezone: str = Field(..., max_length=64)
    date_format: str = Field(..., max_length=30)
    time_format: str = Field(..., max_length=30)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone")
        return v


class SecuritySettingsSchema(BaseModel):
    lockout_enabled: bool = True
    lockout_attempts: int = Field(5, ge=1, le=50)
    lockout_minutes: int = Field(15, ge=0, le=10080)
    idle_minutes: int = Field(60, ge=0, le=1440)
    access_token_minutes: int = Field(30, ge=5, le=1440)
    refresh_token_days: int = Field(7, ge=1, le=90)
    remember_days: int = Field(30, ge=1, le=365)
    password_reset_minutes: int = Field(60, ge=5, le=1440)
    password_min_length: int = Field(8, ge=6, le=72)
    login_per_minute: int = Field(5, ge=1, le=100)
    auto_block: bool = True
    auto_block_after: int = Field(30, ge=5, le=1000)
    auto_block_window: int = Field(10, ge=1, le=1440)
    auto_block_minutes: int = Field(60, ge=1, le=43200)
    log_days: int = Field(30, ge=1, le=365)


class MailSettingsSchema(BaseModel):
    enabled: bool = False
    host: str = Field("", max_length=255)
    port: int = Field(587, ge=1, le=65535)
    encryption: Literal["tls", "ssl", "none"] = "tls"
    username: str = Field("", max_length=255)
    password: Optional[str] = Field(None, max_length=500)
    from_address: str = Field("", max_length=255)
    from_name: str = Field("", max_length=150)
    reply_to: str = Field("", max_length=255)


class MailTestSchema(BaseModel):
    to: EmailStr


class ScriptsSettingsSchema(BaseModel):
    header_scripts: str = Field("", max_length=50000)
    footer_scripts: str = Field("", max_length=50000)
    custom_css: str = Field("", max_length=50000)


class MaintenanceSettingsSchema(BaseModel):
    enabled: bool = False
    title: str = Field("", max_length=255)
    message: str = Field("", max_length=2000)
    ends_at: Optional[datetime] = None

    def model_dump(self, **kwargs):
        data = super().model_dump(**kwargs)
        data["ends_at"] = iso(to_utc(self.ends_at))
        return data


class CommentsSettingsSchema(BaseModel):
    enabled: bool = True
    allow_replies: bool = True
    max_depth: int = Field(3, ge=1, le=5)
    notify_admins: bool = True
    close_after_days: int = Field(0, ge=0, le=3650)


class CustomerAuthSettingsSchema(BaseModel):
    password_enabled: bool = True
    otp_enabled: bool = False
    google_enabled: bool = False
    allow_registration: bool = True
    google_client_id: str = Field("", max_length=255)
    otp_length: int = Field(6, ge=4, le=8)
    otp_expiry_minutes: int = Field(5, ge=1, le=30)
    otp_resend_seconds: int = Field(30, ge=10, le=600)
    otp_max_attempts: int = Field(5, ge=1, le=10)
    session_days: int = Field(30, ge=1, le=365)

    @field_validator("google_client_id")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class RobotsSettingsSchema(BaseModel):
    content: str = Field(..., max_length=20000)


GROUP_SCHEMAS: dict[str, type[BaseModel]] = {
    "general": GeneralSettingsSchema,
    "date_time": DateTimeSettingsSchema,
    "security": SecuritySettingsSchema,
    "mail": MailSettingsSchema,
    "scripts": ScriptsSettingsSchema,
    "maintenance": MaintenanceSettingsSchema,
    "comments": CommentsSettingsSchema,
    "customer_auth": CustomerAuthSettingsSchema,
    "robots": RobotsSettingsSchema,
}
