from app.core.config import DEFAULT_APP_NAME
from app.shared.utils.datetime import DEFAULT_TIMEZONE

DEFAULTS: dict[str, dict] = {
    "general": {
        "app_name": DEFAULT_APP_NAME,
        "tagline": "",
        "logo_light": None,
        "logo_dark": None,
        "favicon": None,
        "addresses": [],
        "phones": [],
        "emails": [],
        "social_links": [],
        "footer_text": "",
    },
    "date_time": {
        "timezone": DEFAULT_TIMEZONE,
        "date_format": "d M Y",
        "time_format": "h:mm a",
    },
    "security": {
        "lockout_enabled": True,
        "lockout_attempts": 5,
        "lockout_minutes": 15,
        "idle_minutes": 60,
        "access_token_minutes": 30,
        "refresh_token_days": 7,
        "remember_days": 30,
        "password_reset_minutes": 60,
        "password_min_length": 8,
        "login_per_minute": 5,
        "auto_block": True,
        "auto_block_after": 30,
        "auto_block_window": 10,
        "auto_block_minutes": 60,
        "log_days": 30,
    },
    "mail": {
        "enabled": False,
        "host": "",
        "port": 587,
        "encryption": "tls",
        "username": "",
        "password": None,
        "from_address": "",
        "from_name": "",
        "reply_to": "",
    },
    "scripts": {
        "header_scripts": "",
        "footer_scripts": "",
        "custom_css": "",
    },
    "maintenance": {
        "enabled": False,
        "title": "We'll be back soon",
        "message": "We're doing some scheduled maintenance. Please check back shortly.",
        "ends_at": None,
    },
    "comments": {
        "enabled": True,
        "allow_replies": True,
        "max_depth": 3,
        "notify_admins": True,
        "close_after_days": 0,
    },
    "customer_auth": {
        "password_enabled": True,
        "otp_enabled": False,
        "google_enabled": False,
        "allow_registration": True,
        "google_client_id": "",
        "otp_length": 6,
        "otp_expiry_minutes": 5,
        "otp_resend_seconds": 30,
        "otp_max_attempts": 5,
        "session_days": 30,
    },
    "robots": {
        "content": "User-agent: *\nAllow: /\nDisallow: /admin\n",
    },
}

SECRET_KEYS: dict[str, set[str]] = {"mail": {"password"}}

PUBLIC_GROUPS: dict[str, list[str] | None] = {
    "general": None,
    "date_time": None,
    "scripts": None,
    "maintenance": None,
    "comments": ["enabled", "allow_replies", "max_depth"],
}
