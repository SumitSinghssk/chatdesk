"""Snooze rules on a chat. No database needed."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

import app.models  # noqa: F401  (every model, so WaConversation can be built)

from app.modules.customer.inbox import snooze
from app.modules.customer.inbox.models import WaConversation
from app.shared.utils.datetime import now


def chat(**kw) -> WaConversation:
    return WaConversation(status=kw.pop("status", "open"), snooze_keep=False, **kw)


def in_hours(h: float) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=h)  # what the browser sends: with an offset


def test_snooze_stores_utc_and_rounds_to_the_minute():
    c = chat()
    text = snooze.snooze(c, in_hours(3), "  waiting for courier ", False, 7)
    assert text == "Snoozed: waiting for courier"
    assert c.snoozed_until.tzinfo is None and c.snoozed_until.second == 0
    assert abs((c.snoozed_until - now()).total_seconds() - 3 * 3600) < 90
    assert (c.snoozed_by_id, c.snooze_keep, c.snooze_woke_at) == (7, False, None)


@pytest.mark.parametrize("hours", [-1, 0, 24 * 91])
def test_snooze_needs_a_time_in_the_next_90_days(hours):
    with pytest.raises(HTTPException):
        snooze.snooze(chat(), in_hours(hours), None, False, 1)


def test_resolved_chats_cant_be_snoozed():
    with pytest.raises(HTTPException):
        snooze.snooze(chat(status="resolved"), in_hours(2), None, False, 1)


def test_customer_message_wakes_it_and_marks_it_came_back():
    c = chat()
    snooze.snooze(c, in_hours(5), None, False, 1)
    assert snooze.on_customer_message(c) is False
    assert c.snoozed_until is None and c.snooze_woke_at is not None


def test_keep_snoozed_ignores_the_customer():
    c = chat()
    snooze.snooze(c, in_hours(5), None, True, 1)
    assert snooze.on_customer_message(c) is True
    assert c.snoozed_until is not None and c.snooze_woke_at is None


def test_reply_or_resolve_clears_the_came_back_marker():
    c = chat(snooze_woke_at=now())
    snooze.clear(c)
    assert c.snooze_woke_at is None and c.snoozed_until is None


def test_serialize_hides_a_snooze_that_already_ended():
    c = chat(snoozed_until=now() - timedelta(minutes=5), snooze_note="x")
    data = snooze.serialize(c)
    assert data["snoozed_until"] is None and data["snooze_note"] is None


def test_wake_reports_whether_it_was_snoozed():
    c = chat()
    snooze.snooze(c, in_hours(1), None, False, 1)
    assert snooze.wake(c) is True
    assert snooze.wake(c) is False
