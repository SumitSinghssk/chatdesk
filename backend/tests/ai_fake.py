"""A stand-in AI provider for tests: speaks Anthropic's Messages API and the OpenAI-compatible
/chat/completions API (streaming), so the real provider code runs end to end.

It answers like a tiny, honest model: it quotes the line of its system prompt that best matches the
question, hands over when asked for a person, says [UNKNOWN] when nothing matches, recalls a name the
customer gave earlier, and reports cache reads when the same system prompt comes back.
"""

import hashlib
import http.server
import json
import re
import threading

STOP = {"what", "is", "are", "the", "a", "an", "do", "you", "your", "of", "to", "for", "and", "in", "on", "how",
        "can", "i", "me", "my", "we", "our", "please", "tell", "about", "it", "this", "that", "there", "have"}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if w not in STOP and len(w) > 1}


def think(system: str, messages: list[dict]) -> str:
    question = messages[-1]["content"] if messages else ""
    if isinstance(question, list):
        question = " ".join(b.get("text", "") for b in question if isinstance(b, dict))
    every = " ".join(m["content"] if isinstance(m["content"], str) else "" for m in messages)
    if system.startswith("Update the running summary"):
        names = re.findall(r"my name is (\w+)", question, re.I)
        return f"The customer is {names[0]}." if names else "The customer asked a few questions."
    if re.search(r"\b(human|person|agent|someone)\b", question, re.I):
        return "[HANDOVER] Sure, connecting you with our team now."
    if re.search(r"what('?s| is) my name", question, re.I):
        names = re.findall(r"my name is (\w+)", every + " " + system, re.I) or re.findall(r"customer is (\w+)", system)
        return f"Your name is {names[-1]}." if names else "[UNKNOWN] You haven't told me your name yet."
    if re.search(r"my name is (\w+)", question, re.I):
        return "Nice to meet you! How can I help?"
    wanted = words(question.split("\n")[-1])
    best, score = None, 0
    known = "\n".join(part.split("\n#", 1)[0] for part in re.split(r"# Business information[^\n]*|# IMPORTANT FACTS[^\n]*",
                                                                     system)[1:])
    lines = [line.strip() for line in known.split("\n")]
    for i, line in enumerate(lines):
        if not line or line.startswith(("#", "You are", "<", "Now:", "The customer:", "About", "A:")):
            continue
        overlap = len(wanted & words(line))
        if line.startswith("Q:") and overlap:  # a matching question is answered by the line after it
            line = lines[i + 1] if i + 1 < len(lines) else line
            overlap += 1
        if overlap > score:
            best, score = line, overlap
    if best and score >= 1:
        return best.removeprefix("A: ").removeprefix("- ")
    return "[UNKNOWN] Sorry, I don't have that information right now."


class Fake:
    requests: list[dict] = []
    seen_systems: set[str] = set()
    fail: str | None = None  # "key" | "model" | "quota" | None
    reply: str | None = None  # force the next reply


def _system_text(system) -> str:
    if isinstance(system, list):
        return "\n\n".join(b.get("text", "") for b in system)
    return system or ""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _key(self) -> str:
        return self.headers.get("x-api-key") or (self.headers.get("Authorization") or "").removeprefix("Bearer ")

    def do_GET(self):
        if self._key() == "bad":
            return self._json(401, {"type": "error", "error": {"type": "authentication_error",
                                                               "message": "invalid x-api-key"}})
        if self.path.startswith("/v1/models"):
            if self.headers.get("anthropic-version"):
                data = [{"id": m, "type": "model", "display_name": m, "created_at": "2026-01-01T00:00:00Z"}
                        for m in ("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5")]
                return self._json(200, {"data": data, "has_more": False, "first_id": data[0]["id"],
                                        "last_id": data[-1]["id"]})
            return self._json(200, {"object": "list", "data": [{"id": "gpt-test-mini"}, {"id": "gpt-test"},
                                                               {"id": "text-embedding-test"}]})
        self._json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        Fake.requests.append({"path": self.path, "body": body, "headers": dict(self.headers)})
        if self._key() == "bad" or Fake.fail == "key":
            Fake.fail = None
            return self._json(401, {"type": "error", "error": {"type": "authentication_error",
                                                               "message": "invalid x-api-key"}})
        if Fake.fail == "quota":
            Fake.fail = None
            return self._json(429, {"type": "error", "error": {"type": "rate_limit_error", "message": "slow down"}})
        if self.path.startswith("/v1/messages"):
            return self._anthropic(body)
        if self.path.startswith("/v1/chat/completions"):
            return self._openai(body)
        self._json(404, {"error": {"message": "not found"}})

    def _pieces(self, text: str) -> list[str]:
        return re.findall(r".{1,7}", text, re.S) or [""]

    def _anthropic(self, body):
        system = _system_text(body.get("system"))
        fixed = _system_text(body["system"][:1]) if isinstance(body.get("system"), list) else system
        text = Fake.reply if Fake.reply is not None else think(system, body.get("messages") or [])
        Fake.reply = None
        digest = hashlib.sha256(fixed.encode()).hexdigest()
        fixed_tokens = max(1, len(fixed) // 4)
        cached = digest in Fake.seen_systems
        Fake.seen_systems.add(digest)
        rest = max(1, (len(system) - len(fixed) + len(json.dumps(body.get("messages")))) // 4)
        usage = {"input_tokens": rest, "output_tokens": 1,
                 "cache_read_input_tokens": fixed_tokens if cached else 0,
                 "cache_creation_input_tokens": 0 if cached else fixed_tokens}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()

        def event(name, data):
            self.wfile.write(f"event: {name}\ndata: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()

        event("message_start", {"type": "message_start", "message": {
            "id": "msg_fake", "type": "message", "role": "assistant", "model": body.get("model"), "content": [],
            "stop_reason": None, "stop_sequence": None, "usage": usage}})
        event("content_block_start", {"type": "content_block_start", "index": 0,
                                      "content_block": {"type": "text", "text": ""}})
        for piece in self._pieces(text):
            event("content_block_delta", {"type": "content_block_delta", "index": 0,
                                          "delta": {"type": "text_delta", "text": piece}})
        event("content_block_stop", {"type": "content_block_stop", "index": 0})
        event("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                                "usage": {"output_tokens": max(1, len(text) // 4)}})
        event("message_stop", {"type": "message_stop"})

    def _openai(self, body):
        messages = body.get("messages") or []
        system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
        text = Fake.reply if Fake.reply is not None else think(system, messages[1:])
        Fake.reply = None
        digest = hashlib.sha256(system[:2000].encode()).hexdigest()
        cached = digest in Fake.seen_systems
        Fake.seen_systems.add(digest)
        prompt = max(1, len(json.dumps(messages)) // 4)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for piece in self._pieces(text):
            chunk = {"choices": [{"index": 0, "delta": {"content": piece}}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
        usage = {"prompt_tokens": prompt, "completion_tokens": max(1, len(text) // 4),
                 "prompt_tokens_details": {"cached_tokens": min(prompt, 500) if cached else 0}}
        self.wfile.write(f"data: {json.dumps({'choices': [], 'usage': usage})}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")


def start(port: int = 0) -> http.server.ThreadingHTTPServer:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


if __name__ == "__main__":
    import sys

    srv = start(int(sys.argv[1]) if len(sys.argv) > 1 else 8766)
    print(f"Fake AI on http://127.0.0.1:{srv.server_address[1]}", flush=True)
    threading.Event().wait()
