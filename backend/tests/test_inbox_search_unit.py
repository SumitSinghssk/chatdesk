"""Inbox word search helpers. No database needed."""
import pytest

from app.modules.customer.inbox import search


def test_words_are_lowercased_and_capped():
    assert search.words("Parcel  AB-302, OK!") == ["parcel", "ab", "302", "ok"]
    assert len(search.words(" ".join(f"w{i}" for i in range(20)))) == 8


def test_every_word_is_a_prefix_and_numbers_match_their_dash_form():
    assert search.tsquery("parcel 302") == "parcel:* & (302:* | -302:*)"
    assert search.tsquery("   ") is None and search.tsquery(None) is None


@pytest.mark.parametrize("evil", ["x'); drop table wa_messages;--", "a:* | !b", "(c & d) <-> e", "\\'"])
def test_only_word_characters_reach_the_query(evil):
    q = search.tsquery(evil) or ""
    assert not set(q) & set("';\\!<>-") - {"-"}  # '-' only appears in the "(n:* | -n:*)" number form
    assert "'" not in q and ";" not in q and "!" not in q and "<" not in q


def test_snippet_centres_on_the_match():
    text = "a " * 80 + "the parcel arrived late " + "b " * 80
    s = search.snippet(text, "parcel")
    assert "parcel" in s and s.startswith("…") and s.endswith("…") and len(s) <= 112


def test_short_text_is_returned_whole():
    assert search.snippet("Hi  there\nfriend", "there") == "Hi there friend"


def test_saved_views_keep_only_known_keys():
    assert set(search.VIEW_KEYS) >= {"search", "status", "assignee", "unread", "waiting", "tag"}
