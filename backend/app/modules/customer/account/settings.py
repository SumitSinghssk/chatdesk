"""A person's own settings: preferences (time zone, theme, sounds) and which notifications they get, how."""

from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, field_validator

from app.modules.customer.account.models import Customer

# What can be notified. `managers`: only owners and admins can get it.
EVENTS: dict[str, dict] = {
    "chat_assigned": {"label": "A chat is assigned to you", "managers": False,
                      "default": {"in_app": True, "email": False, "browser": True}},
    "customer_waiting": {"label": "A customer has been waiting for a reply", "managers": False,
                         "default": {"in_app": True, "email": False, "browser": True}},
    "ai_handover": {"label": "The AI agent hands a chat to your team", "managers": False,
                    "default": {"in_app": True, "email": False, "browser": True}},
    "campaign_finished": {"label": "A campaign finished sending", "managers": True,
                          "default": {"in_app": True, "email": True, "browser": False}},
    "whatsapp_problem": {"label": "Your WhatsApp number has a problem", "managers": True,
                         "default": {"in_app": True, "email": True, "browser": True}},
}
CHANNELS = ("in_app", "email", "browser")


class Channels(BaseModel):
    in_app: bool = True
    email: bool = False
    browser: bool = False


class NotificationSettings(BaseModel):
    events: dict[str, Channels] = Field(default_factory=dict)
    waiting_minutes: int = Field(15, ge=1, le=1440)  # "customer waiting" after this long without a reply

    @field_validator("events")
    @classmethod
    def _known(cls, v):
        return {k: c for k, c in v.items() if k in EVENTS}


class Preferences(BaseModel):
    timezone: str = ""  # "" = the business's time zone (Automation -> office hours)
    theme: Literal["system", "light", "dark"] = "system"
    sound: bool = True  # a soft sound for new customer messages and notifications
    date_format: Literal["day_first", "month_first"] = "day_first"

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v):
        v = (v or "").strip()
        if v and v not in available_timezones():
            raise ValueError("Choose a time zone from the list")
        return v


class PreferencesUpdate(Preferences):
    pass


class NotificationsUpdate(BaseModel):
    events: dict[str, Channels]
    waiting_minutes: int = Field(15, ge=1, le=1440)


def is_manager(person: Customer) -> bool:
    return person.workspace_id is None or person.role in ("owner", "admin")


def preferences(person: Customer) -> dict:
    return Preferences(**(person.preferences or {})).model_dump()


def notification_settings(person: Customer) -> dict:
    """Every event this person can get, with their channels (defaults filled in)."""
    saved = NotificationSettings(**(person.notification_settings or {}))
    manager = is_manager(person)
    events = {}
    for key, info in EVENTS.items():
        if info["managers"] and not manager:
            continue
        channels = saved.events.get(key) or Channels(**info["default"])
        events[key] = {"label": info["label"], **channels.model_dump()}
    return {"events": events, "waiting_minutes": saved.waiting_minutes}


def channels_for(person: Customer, event: str) -> dict:
    settings = notification_settings(person)
    return settings["events"].get(event) or {"in_app": False, "email": False, "browser": False}

