"""Exotel call details → answered / missed / not connected. No database or network needed."""
import pytest

from app.services.voice.exotel import ExotelGateway, safe_recording_url

CFG = {"account_sid": "acc", "api_key": "key", "api_token": "token"}
BASE = {"Sid": "sid1", "From": "09000000001", "To": "09812345678", "StartTime": "2026-11-11 10:00:00",
        "EndTime": "2026-11-11 10:03:00", "RecordingUrl": "https://recordings.exotel.com/a.mp3"}


def _fetch(monkeypatch, call: dict, params: dict | None = None):
    gateway = ExotelGateway()
    monkeypatch.setattr(gateway, "request", lambda *a, **k: (200, {"Call": {**BASE, **call}}, "application/json"))
    return gateway.fetch(CFG, "sid1", params or {})


def test_outbound_answered(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "outbound-api", "Status": "completed", "Details": {
        "ConversationDuration": 120, "Leg1Status": "completed", "Leg2Status": "completed"}})
    assert (r.ended, r.answered, r.customer_rung, r.duration) == (True, True, True, 120)
    assert r.customer_number == "09812345678"
    assert r.started_at.hour == 4 and r.started_at.minute == 30  # IST → UTC


def test_outbound_customer_did_not_pick_up(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "outbound-api", "Status": "completed", "Details": {
        "ConversationDuration": 0, "Leg1Status": "completed", "Leg2Status": "no-answer"}})
    assert (r.ended, r.answered, r.customer_rung) == (True, False, True)


def test_outbound_business_did_not_pick_up(monkeypatch):
    # the customer was never rung, so no "sorry we missed you" may go out
    r = _fetch(monkeypatch, {"Direction": "outbound-api", "Status": "no-answer", "Details": {
        "ConversationDuration": 0, "Leg1Status": "no-answer", "Leg2Status": None}})
    assert (r.ended, r.answered, r.customer_rung) == (True, False, False)


def test_inbound_passthru_after_connect(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "inbound", "Status": "in-progress", "Details": {}},
               {"DialCallStatus": "completed", "DialCallDuration": "45"})
    assert (r.ended, r.answered, r.duration) == (True, True, 45)
    assert r.customer_number == "09000000001"


def test_inbound_nobody_picked_up(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "inbound", "Status": "completed", "Details": {"Leg2Status": "no-answer"}},
               {"DialCallStatus": "no-answer"})
    assert (r.ended, r.answered) == (True, False)


def test_inbound_still_in_the_menu(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "inbound", "Status": "in-progress", "Details": {}})
    assert (r.ended, r.answered) == (False, None)


@pytest.mark.parametrize("url, ok", [
    ("https://recordings.exotel.com/a.mp3", True),
    ("https://s3.exotel.in/a.mp3", True),
    ("https://exotel.com/a.mp3", True),
    ("http://recordings.exotel.com/a.mp3", False),
    ("https://exotel.com.evil.io/a.mp3", False),
    ("https://evil.com/a.mp3", False),
    (None, False),
])
def test_recording_urls_only_from_exotel(url, ok):
    # the account's credentials are sent along, so never to anyone else
    assert (safe_recording_url(url) is not None) is ok


def test_webhook_recording_url_is_not_trusted(monkeypatch):
    r = _fetch(monkeypatch, {"Direction": "inbound", "Status": "completed", "RecordingUrl": None, "Details": {}},
               {"RecordingUrl": "https://attacker.example/steal"})
    assert r.recording_url is None
