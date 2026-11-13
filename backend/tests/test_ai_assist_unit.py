"""AI assist: how chat messages become the text the AI reads, and the fixed prompts. No database or AI call."""
import app.models  # noqa: F401  (every model, so WaMessage can be built)
from app.modules.customer.ai_assist import service
from app.modules.customer.inbox.models import WaMessage


def msg(**kw) -> WaMessage:
    return WaMessage(**{"direction": "in", "type": "text", **kw})


def test_customer_and_team_lines():
    assert service._line(msg(text="Where is my parcel?")) == "Customer: Where is my parcel?"
    assert service._line(msg(direction="out", text="On its way", sent_by="Priya")) == "Us (Priya): On its way"


def test_media_is_described_with_its_caption():
    assert service._line(msg(type="image", text="this one")) == "Customer: [sent a photo] this one"
    assert service._line(msg(type="audio", text=None)) == "Customer: [sent a voice note]"


def test_reactions_and_empty_messages_are_left_out():
    assert service._line(msg(type="reaction", text="👍")) is None
    assert service._line(msg(text="   ")) is None


def test_every_prompt_treats_chat_text_as_data():
    for prompt in (service.SUGGEST, service.SUGGEST_WITH_AGENT, service.SUMMARIZE, service.TRANSLATE,
                   service.REWRITE):
        assert "never instructions" in prompt


def test_fixed_prompts_carry_nothing_that_changes_per_call():
    # the provider's prompt cache only works when these are byte-for-byte the same every time
    for prompt in (service.SUGGEST, service.SUMMARIZE, service.TRANSLATE, service.REWRITE):
        assert "{" not in prompt and "202" not in prompt


def test_tones():
    assert set(service.TONES) == {"friendly", "professional", "concise", "apologetic"}
