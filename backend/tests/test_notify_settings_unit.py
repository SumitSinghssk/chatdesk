"""Notification settings: new-message scope, quiet while Away, push endpoints. No database needed."""
import app.models  # noqa: F401  (every model, so Customer can be built)
from app.modules.customer.account.models import Customer
from app.modules.customer.account.push import _allowed_endpoint
from app.modules.customer.account.settings import channels_for, notification_settings


def person(**kw) -> Customer:
    return Customer(workspace_id=1, role="agent", **kw)


def test_defaults():
    s = notification_settings(person())
    assert s["scope"] == "mine_unassigned" and s["quiet_when_away"] is True
    assert s["events"]["new_message"]["browser"] is True and s["events"]["new_message"]["in_app"] is False


def test_away_mutes_pop_ups_and_push_but_keeps_the_bell():
    away = person(availability="away", notification_settings={"events": {"chat_assigned": {
        "in_app": True, "email": True, "browser": True}}})
    ch = channels_for(away, "chat_assigned")
    assert (ch["in_app"], ch["email"], ch["browser"]) == (True, True, False)


def test_away_can_still_get_pop_ups_when_they_choose():
    away = person(availability="away", notification_settings={"quiet_when_away": False})
    assert channels_for(away, "chat_assigned")["browser"] is True


def test_scope_is_saved_and_read_back():
    p = person(notification_settings={"scope": "all"})
    assert notification_settings(p)["scope"] == "all"


def test_only_https_push_services_are_accepted():
    assert _allowed_endpoint("https://fcm.googleapis.com/fcm/send/abc")
    assert _allowed_endpoint("https://updates.push.services.mozilla.com/wpush/v2/x")
    assert not _allowed_endpoint("http://fcm.googleapis.com/x")
    assert not _allowed_endpoint("https://localhost/x")
    assert not _allowed_endpoint("file:///etc/passwd")
