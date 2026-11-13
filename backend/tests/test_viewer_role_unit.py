"""The viewer role: which write requests it may still make. No database needed."""
import pytest

from app.modules.customer.inbox.service import AUTOMATED_SENDERS
from app.modules.customer.team.access import ROLES, VIEWER_WRITES


def allowed(path: str) -> bool:
    return any(p.match(path) for p in VIEWER_WRITES)


@pytest.mark.parametrize("path", [
    "/api/v1/customer/inbox/conversations/12/read",
    "/api/v1/customer/inbox/conversations/12/presence",
    "/api/v1/customer/team/availability",
    "/api/v1/customer/numbers/3/switch",
])
def test_viewer_may_open_chats_and_be_seen(path):
    assert allowed(path)


@pytest.mark.parametrize("path", [
    "/api/v1/customer/inbox/conversations/12/messages",
    "/api/v1/customer/inbox/conversations/12/template",
    "/api/v1/customer/inbox/conversations/12/notes",
    "/api/v1/customer/inbox/conversations/12/assign",
    "/api/v1/customer/inbox/conversations/12/status",
    "/api/v1/customer/inbox/conversations/12/presence/extra",
    "/api/v1/customer/contacts",
    "/api/v1/customer/calls",
    "/api/v1/customer/numbers",
])
def test_viewer_may_not_change_anything_else(path):
    assert not allowed(path)


def test_roles():
    assert "viewer" in ROLES


def test_automated_senders_match_the_modules():
    from app.modules.customer.ai_agent.engine import SENDER as ai
    from app.modules.customer.automation.engine import SENDER as auto
    from app.modules.customer.calls.service import SENDER as calls
    from app.modules.customer.chatbots.engine import SENDER as bot
    from app.modules.customer.commerce.flow import SENDER as shop

    # a bot's message must never count as "a colleague replied while you were typing"
    assert {ai, auto, calls, bot, shop} <= set(AUTOMATED_SENDERS)
