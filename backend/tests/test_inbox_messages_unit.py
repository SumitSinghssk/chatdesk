"""How messages are labelled for the inbox. No database needed."""
import app.models  # noqa: F401  (every model, so WaMessage can be built)
from app.modules.customer.inbox.models import WaMessage
from app.modules.customer.inbox.service import AUTOMATED_SENDERS, SOURCE_KINDS, serialize_message


def out(**kw) -> dict:
    return serialize_message(WaMessage(id=1, direction="out", type="text", **kw))


def test_bots_and_automatic_messages_are_labelled():
    assert out(sent_by="Chatbot")["source"] == {"kind": "chatbot", "label": "Chatbot"}
    assert out(sent_by="AI agent")["source"]["kind"] == "ai"
    assert set(SOURCE_KINDS) == set(AUTOMATED_SENDERS)


def test_campaign_messages_say_which_campaign():
    data = out(sent_by="Owner", payload={"template": {"campaign": {"id": 3, "name": "Diwali sale"}}})
    assert data["source"] == {"kind": "campaign", "label": "Campaign · Diwali sale"}


def test_people_get_no_label():
    assert out(sent_by="Priya")["source"] is None
    assert serialize_message(WaMessage(id=2, direction="in", type="text", sent_by=None))["source"] is None


def test_our_reactions_point_at_the_message():
    data = serialize_message(WaMessage(id=3, direction="out", type="reaction", text="👍",
                                       payload={"reaction": {"message_id": "wamid.A", "emoji": "👍"}}))
    assert data["reaction_to"] == "wamid.A" and data["text"] == "👍"
