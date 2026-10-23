"""The AI providers an agent can run on, behind one small interface: `list_models()` and `chat()`.

Claude goes through Anthropic's SDK; every other provider speaks the OpenAI-compatible
`/chat/completions` API (OpenAI, Gemini, Groq, DeepSeek, Mistral, OpenRouter, or any custom base URL),
so one HTTP client covers them all.

Usage is kept low on every provider the same way: the system prompt is split into a fixed part
(instructions + knowledge, identical on every call, so the provider's prompt cache serves it) and a
small changing part (memory summary, matching passages, today's date) that goes after it.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Callable

import anthropic
import httpx

# USD per 1M tokens: input, output, cache read (cache writes cost 1.25x input on Claude)
CLAUDE_PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-fable-5-1": (10.00, 50.00, 0.25),
    "claude-opus-5": (5.00, 25.00, 0.50),
    "claude-sonnet-5": (2.00, 10.00, 0.20),
    "claude-opus-4-8": (5.00, 25.00, 0.50),
    "claude-sonnet-4-6": (3.00, 15.00, 0.30),
    "claude-haiku-4-5": (1.00, 5.00, 0.10),
}
# Claude models that take `output_config.effort` / server-side refusal fallbacks
EFFORT_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-opus-5",
                 "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6"}
FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"}

PROVIDERS: dict[str, dict] = {
    "anthropic": {
        "label": "Claude", "company": "Anthropic", "kind": "anthropic", "base_url": None, "prefix": "sk-ant-",
        "keys_url": "https://console.anthropic.com/settings/keys",
        "models": ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
        "hint": "Claude Opus 5.5 gives the best answers; Claude Haiku 5.5 is the cheapest and fastest.",
    },
    "openai": {
        "label": "ChatGPT", "company": "OpenAI", "kind": "openai", "base_url": "https://api.openai.com/v1",
        "prefix": "sk-", "keys_url": "https://platform.openai.com/api-keys", "models": [],
        "hint": "Pick a model after the key is checked; \"mini\" models cost the least.",
    },
    "gemini": {
        "label": "Gemini", "company": "Google", "kind": "openai",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "prefix": "AIza",
        "keys_url": "https://aistudio.google.com/apikey", "models": [],
        "hint": "\"Flash\" models are fast and cheap.",
    },
    "groq": {
        "label": "Groq", "company": "Groq", "kind": "openai", "base_url": "https://api.groq.com/openai/v1",
        "prefix": "gsk_", "keys_url": "https://console.groq.com/keys", "models": [],
        "hint": "Very fast open models (Llama, Qwen and more).",
    },
    "deepseek": {
        "label": "DeepSeek", "company": "DeepSeek", "kind": "openai", "base_url": "https://api.deepseek.com/v1",
        "prefix": "sk-", "keys_url": "https://platform.deepseek.com/api_keys", "models": [], "hint": "",
    },
    "mistral": {
        "label": "Mistral", "company": "Mistral AI", "kind": "openai", "base_url": "https://api.mistral.ai/v1",
        "prefix": "", "keys_url": "https://console.mistral.ai/api-keys", "models": [], "hint": "",
    },
    "openrouter": {
        "label": "OpenRouter", "company": "OpenRouter", "kind": "openai", "base_url": "https://openrouter.ai/api/v1",
        "prefix": "sk-or-", "keys_url": "https://openrouter.ai/keys", "models": [],
        "hint": "One key for hundreds of models from every company.",
    },
    "custom": {
        "label": "Other", "company": "Any OpenAI-compatible API", "kind": "openai", "base_url": None, "prefix": "",
        "keys_url": None, "models": [],
        "hint": "Together, Fireworks, Azure OpenAI, a self-hosted Ollama or vLLM... anything with /chat/completions.",
    },
}

# models a chat agent can't use (the OpenAI-compatible /models lists everything the key can call)
_NOT_CHAT = ("embed", "tts", "whisper", "dall-e", "image", "audio", "moderation", "realtime", "transcribe",
             "davinci", "babbage", "guard", "imagen", "veo", "aqa", "speech", "search-preview")


class ProviderError(Exception):
    def __init__(self, message: str, kind: str = "error"):
        super().__init__(message)
        self.kind = kind  # key | model | quota | network | declined | error


@dataclass
class Result:
    text: str
    model: str
    input_tokens: int = 0  # not served from cache
    output_tokens: int = 0
    cache_read: int = 0
    cache_write: int = 0
    raw_usage: dict = field(default_factory=dict)


def address_allowed(url: str) -> bool:
    """A business's own API address must be on the public internet in production (no requests into our
    network). Development allows private ones, e.g. a model running on the same machine."""
    from app.core.config import settings
    from app.modules.customer.chatbots.engine import _public

    return not settings.is_production or _public(url)


def _base(provider: str, base_url: str | None) -> str:
    override = os.getenv("AI_PROVIDER_BASE_URL")  # tests point every provider at a fake server
    if override:
        return override.rstrip("/") + ("" if provider == "anthropic" else "/v1")
    if base_url and not address_allowed(base_url):
        raise ProviderError("That API address isn't on the public internet.")
    return (base_url or PROVIDERS[provider]["base_url"] or "").rstrip("/")


def cost(provider: str, model: str, r: Result, prices: dict | None = None) -> tuple[float, float]:
    """(what this call cost, what the cache saved) in USD; 0 when the price isn't known."""
    if provider == "anthropic" and model in CLAUDE_PRICES:
        p_in, p_out, p_read = CLAUDE_PRICES[model]
    elif prices and model in prices:
        p_in, p_out = prices[model][:2]
        p_read = p_in * 0.25 if provider != "anthropic" else p_in * 0.1
    else:
        return 0.0, 0.0
    spent = (r.input_tokens * p_in + r.cache_write * p_in * 1.25 + r.cache_read * p_read + r.output_tokens * p_out)
    return spent / 1e6, r.cache_read * (p_in - p_read) / 1e6


# Anthropic ----------------------------------------------------------------------------------

def _claude(key: str, base_url: str | None) -> anthropic.Anthropic:
    base = _base("anthropic", base_url) or None
    return anthropic.Anthropic(api_key=key, base_url=base, max_retries=1,
                               timeout=anthropic.Timeout(60.0, connect=10.0))


def _claude_error(exc: Exception) -> ProviderError:
    if isinstance(exc, anthropic.AuthenticationError):
        return ProviderError("Claude rejected the API key. Check it in your Anthropic console.", "key")
    if isinstance(exc, anthropic.PermissionDeniedError):
        return ProviderError("This API key isn't allowed to use that model.", "key")
    if isinstance(exc, anthropic.NotFoundError):
        return ProviderError("That Claude model doesn't exist or isn't available to this key.", "model")
    if isinstance(exc, anthropic.RateLimitError):
        return ProviderError("Claude is rate limiting this key (too many requests or no credit left).", "quota")
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code >= 500:
            return ProviderError("Claude is having trouble right now. Try again in a moment.", "network")
        return ProviderError(f"Claude said: {exc.message}"[:300], "error")
    if isinstance(exc, anthropic.APIConnectionError):
        return ProviderError("Couldn't reach Claude. Check the internet connection.", "network")
    return ProviderError(str(exc)[:300])


def _claude_chat(key, base_url, model, static, dynamic, messages, max_tokens, effort, on_text) -> Result:
    client = _claude(key, base_url)
    system = [{"type": "text", "text": static, "cache_control": {"type": "ephemeral"}}]
    if dynamic:
        system.append({"type": "text", "text": dynamic})
    kwargs: dict = {"model": model, "max_tokens": max_tokens, "system": system, "messages": messages}
    if model in EFFORT_MODELS:
        kwargs["output_config"] = {"effort": effort}
        kwargs["max_tokens"] = max_tokens + 3000  # room for the model's (adaptive) thinking before it replies
    try:
        if model in FALLBACK_MODELS:  # a declined request is re-run on Anthropic's recommended model
            stream_cm = client.beta.messages.stream(betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                                                    **kwargs)
        else:
            stream_cm = client.messages.stream(**kwargs)
        with stream_cm as stream:
            for text in stream.text_stream:
                if on_text:
                    on_text(text)
            final = stream.get_final_message()
    except Exception as exc:  # noqa: BLE001 - every SDK error becomes a message the business can act on
        raise _claude_error(exc) from exc
    if final.stop_reason == "refusal":
        raise ProviderError("Claude declined to answer this message.", "declined")
    text = "".join(b.text for b in final.content if getattr(b, "type", None) == "text")
    u = final.usage
    return Result(text=text, model=getattr(final, "model", model) or model, input_tokens=u.input_tokens or 0,
                  output_tokens=u.output_tokens or 0, cache_read=getattr(u, "cache_read_input_tokens", 0) or 0,
                  cache_write=getattr(u, "cache_creation_input_tokens", 0) or 0)


# OpenAI-compatible ----------------------------------------------------------------------------

def _headers(provider: str, key: str) -> dict:
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if provider == "openrouter":
        headers |= {"HTTP-Referer": os.getenv("FRONTEND_URL", "https://chatdesk.app"), "X-Title": "ChatDesk"}
    return headers


def _openai_error(provider: str, status: int, body: str) -> ProviderError:
    name = PROVIDERS[provider]["label"] if provider != "custom" else "The AI provider"
    try:
        detail = json.loads(body)
        detail = detail[0] if isinstance(detail, list) and detail else detail
        msg = (detail.get("error") or {}).get("message") if isinstance(detail.get("error"), dict) \
            else detail.get("error") or detail.get("message")
    except (ValueError, AttributeError):
        msg = None
    msg = str(msg or body or "")[:200]
    if status in (401, 403):
        return ProviderError(f"{name} rejected the API key. {msg}".strip(), "key")
    if status == 404:
        return ProviderError(f"{name} doesn't have that model (or the address is wrong). {msg}".strip(), "model")
    if status == 429:
        return ProviderError(f"{name} is rate limiting this key, or it has no credit left. {msg}".strip(), "quota")
    if status >= 500:
        return ProviderError(f"{name} is having trouble right now. Try again in a moment.", "network")
    return ProviderError(f"{name} said: {msg}"[:300])


def _openai_chat(provider, key, base_url, model, static, dynamic, messages, max_tokens, on_text) -> Result:
    url = f"{_base(provider, base_url)}/chat/completions"
    system = static + ("\n\n" + dynamic if dynamic else "")
    body: dict = {"model": model, "stream": True, "stream_options": {"include_usage": True},
                  "messages": [{"role": "system", "content": system}, *messages]}
    body["max_completion_tokens" if provider == "openai" else "max_tokens"] = max_tokens
    for attempt in range(3):
        parts: list[str] = []
        usage: dict = {}
        try:
            with httpx.stream("POST", url, headers=_headers(provider, key), json=body,
                              timeout=httpx.Timeout(60.0, connect=10.0)) as res:
                if res.status_code >= 400:
                    text = res.read().decode("utf-8", "replace")
                    lowered = text.lower()
                    # some providers don't take one of the optional fields: drop it and ask again
                    if res.status_code == 400 and attempt < 2 and "stream_options" in lowered and "stream_options" in body:
                        body.pop("stream_options")
                        continue
                    if res.status_code == 400 and attempt < 2 and "max_tokens" in lowered and "max_tokens" in body:
                        body["max_completion_tokens"] = body.pop("max_tokens")
                        continue
                    if res.status_code == 400 and attempt < 2 and "max_completion_tokens" in lowered \
                            and "max_completion_tokens" in body:
                        body["max_tokens"] = body.pop("max_completion_tokens")
                        continue
                    raise _openai_error(provider, res.status_code, text)
                for line in res.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except ValueError:
                        continue
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    for choice in chunk.get("choices") or []:
                        piece = (choice.get("delta") or {}).get("content")
                        if piece:
                            parts.append(piece)
                            if on_text:
                                on_text(piece)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Couldn't reach the AI provider: {exc}"[:300], "network") from exc
        break
    prompt = usage.get("prompt_tokens") or 0
    cached = ((usage.get("prompt_tokens_details") or {}).get("cached_tokens")
              or usage.get("prompt_cache_hit_tokens") or 0)
    return Result(text="".join(parts), model=model, input_tokens=max(prompt - cached, 0),
                  output_tokens=usage.get("completion_tokens") or 0, cache_read=cached, raw_usage=usage)


# The interface --------------------------------------------------------------------------------

def list_models(provider: str, key: str, base_url: str | None = None) -> list[str]:
    """Model ids the key can use. Also the cheapest way to check a key: it costs no tokens."""
    if provider not in PROVIDERS:
        raise ProviderError("Unknown AI provider.")
    if PROVIDERS[provider]["kind"] == "anthropic":
        try:
            ids = [m.id for m in _claude(key, base_url).models.list(limit=100)]
        except Exception as exc:  # noqa: BLE001
            raise _claude_error(exc) from exc
        suggested = PROVIDERS["anthropic"]["models"]
        return [m for m in suggested if m in ids] + [m for m in ids if m not in suggested]
    base = _base(provider, base_url)
    if not base:
        raise ProviderError("Enter the API address (base URL) of the provider.")
    try:
        res = httpx.get(f"{base}/models", headers=_headers(provider, key), timeout=15.0)
    except httpx.HTTPError as exc:
        raise ProviderError(f"Couldn't reach the AI provider: {exc}"[:300], "network") from exc
    if res.status_code >= 400:
        raise _openai_error(provider, res.status_code, res.text)
    try:
        items = res.json().get("data") or []
    except ValueError as exc:
        raise ProviderError("The address answered, but not like an OpenAI-compatible API.") from exc
    ids = sorted({str(m.get("id", "")).removeprefix("models/") for m in items if m.get("id")})
    return [i for i in ids if i and not any(word in i.lower() for word in _NOT_CHAT)]


def chat(provider: str, key: str, base_url: str | None, model: str, static: str, dynamic: str,
         messages: list[dict], max_tokens: int = 1200, effort: str = "low",
         on_text: Callable[[str], None] | None = None) -> Result:
    """One reply. `static` must be byte-for-byte the same on every call for the cache to work."""
    if provider not in PROVIDERS:
        raise ProviderError("Unknown AI provider.")
    if PROVIDERS[provider]["kind"] == "anthropic":
        return _claude_chat(key, base_url, model, static, dynamic, messages, max_tokens, effort, on_text)
    return _openai_chat(provider, key, base_url, model, static, dynamic, messages, max_tokens, on_text)
