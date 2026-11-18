"""A person's own settings: preferences (time zone, theme, sounds) and which notifications they get, how."""

from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, field_validator

from app.modules.customer.account.models import Customer

# What can be notified. `managers`: only owners and admins can get it.
EVENTS: dict[str, dict] = {
    "new_message": {"label": "A customer sends a message (in the chats you choose below)", "managers": False,
                    "default": {"in_app": False, "email": False, "browser": True}},
    "missed_call": {"label": "A WhatsApp call to you or your team is missed", "managers": False,
                    "default": {"in_app": True, "email": False, "browser": True}},
    "unhappy_customer": {"label": "A customer gives a low rating (1 or 2 out of 5)", "managers": False,
                         "default": {"in_app": True, "email": True, "browser": True}},
    "spend_alert": {"label": "WhatsApp spend reaches 80% or 100% of the monthly budget", "managers": True,
                    "default": {"in_app": True, "email": True, "browser": False}},
    "chat_assigned": {"label": "A chat is assigned to you", "managers": False,
                      "default": {"in_app": True, "email": False, "browser": True}},
    "customer_waiting": {"label": "A customer has been waiting for a reply", "managers": False,
                         "default": {"in_app": True, "email": False, "browser": True}},
    "ai_handover": {"label": "The AI agent hands a chat to your team", "managers": False,
                    "default": {"in_app": True, "email": False, "browser": True}},
    "snooze_ended": {"label": "A chat you snoozed comes back", "managers": False,
                     "default": {"in_app": True, "email": False, "browser": True}},
    "campaign_finished": {"label": "A campaign finished sending", "managers": True,
                          "default": {"in_app": True, "email": True, "browser": False}},
    "whatsapp_problem": {"label": "Your WhatsApp number has a problem", "managers": True,
                         "default": {"in_app": True, "email": True, "browser": True}},
    "new_order": {"label": "A customer places an order", "managers": True,
                  "default": {"in_app": True, "email": False, "browser": True}},
    "payment_received": {"label": "A customer pays online", "managers": True,
                         "default": {"in_app": True, "email": False, "browser": True}},
    "diagram_comment": {"label": "Someone comments on your diagram, replies to you or @mentions you",
                        "managers": False, "default": {"in_app": True, "email": False, "browser": True}},
    "diagram_task": {"label": "You're given a task in a diagram, and when it's due", "managers": False,
                     "default": {"in_app": True, "email": True, "browser": True}},
    "diagram_approval": {"label": "Someone asks to change an approved diagram", "managers": False,
                         "default": {"in_app": True, "email": True, "browser": True}},
}
CHANNELS = ("in_app", "email", "browser")


class Channels(BaseModel):
    in_app: bool = True
    email: bool = False
    browser: bool = False


Scope = Literal["mine", "mine_unassigned", "all"]


class NotificationSettings(BaseModel):
    events: dict[str, Channels] = Field(default_factory=dict)
    waiting_minutes: int = Field(15, ge=1, le=1440)  # "customer waiting" after this long without a reply
    # new messages from: chats assigned to me | mine + nobody's | every chat I can see
    scope: Scope = "mine_unassigned"
    # no browser pop-ups or push while I've set myself Away (the bell still keeps them)
    quiet_when_away: bool = True

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
    scope: Scope = "mine_unassigned"
    quiet_when_away: bool = True


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
    return {"events": events, "waiting_minutes": saved.waiting_minutes, "scope": saved.scope,
            "quiet_when_away": saved.quiet_when_away}


def channels_for(person: Customer, event: str) -> dict:
    settings = notification_settings(person)
    ch = dict(settings["events"].get(event) or {"in_app": False, "email": False, "browser": False})
    if settings["quiet_when_away"] and getattr(person, "availability", None) == "away":
        ch["browser"] = False  # no pop-ups or push while Away; the bell still has it
    return ch

