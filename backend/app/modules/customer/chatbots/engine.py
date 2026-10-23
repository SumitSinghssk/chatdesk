"""Runs chatbots: starts them from triggers, walks the flow block by block, waits for answers.

The same `Runner` drives a real chat (sending through WhatsApp, saving to the contact) and the test
chat on the canvas (`SimRunner`, which only describes what would happen). A real run's position is a
`WaChatbotSession` row; a test run's is a plain dict the page sends back with every message.
"""

import ipaddress
import json
import logging
import mimetypes
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from types import SimpleNamespace

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.modules.customer.account.models import Customer
from app.modules.customer.automation import engine as auto
from app.modules.customer.chatbots.graph import Graph
from app.modules.customer.chatbots.models import WaChatbot, WaChatbotSession
from app.modules.customer.chatbots.schemas import UNIT_SECONDS, BotSettings
from app.modules.customer.inbox.models import WaContact, WaConversation, WaMessage
from app.services.whatsapp import WhatsAppClient, WhatsAppError
from app.shared.utils.datetime import iso, now

logger = logging.getLogger(__name__)
SENDER = "Chatbot"
MAX_STEPS = 40  # blocks in one go before we assume a loop
TRAIL_MAX = 300
MEDIA_ID_DAYS = 25
MEDIA_TYPES = ("image", "video", "audio", "document", "sticker")
VAR = re.compile(r"\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}", re.I)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
INVALID = {
    "number": "Please send a number.",
    "email": "That doesn't look like an email address. Please type it again, e.g. name@example.com",
    "phone": "Please send a phone number with digits only, e.g. 9876543210",
    "date": "Please send a date like 25/12/2026.",
    "media": "Please send a photo or a file.",
    "text": "Please type your answer.",
}
END_LABELS = {"completed": "finished", "handover": "handed the chat to the team", "timeout": "timed out",
              "stopped": "was stopped", "agent": "stopped: a person replied", "opted_out": "stopped: opted out",
              "replaced": "was replaced by another chatbot", "invalid": "ended after wrong answers",
              "failed": "stopped after an error"}


@dataclass
class Incoming:
    text: str = ""
    reply_id: str | None = None  # id of a tapped button / list option
    media: bool = False


class Stop(Exception):
    """The run can't go on (a send failed, or the flow loops)."""


def bot_settings(bot: WaChatbot, published: bool = True) -> dict:
    raw = (bot.published_settings if published else None) or bot.settings or {}
    return BotSettings(**raw).model_dump()


def first_name(contact) -> str:
    name = contact.name or contact.profile_name or ""
    return name.split()[0] if name else ""


def render(text: str | None, contact, variables: dict) -> str | None:
    """Fills {{first_name}}, {{name}}, {{phone}}, {{email}}, {{contact.city}} and answers like {{city}}."""
    if not text:
        return text

    def value(m):
        key = m.group(1).lower()
        if key == "first_name":
            return first_name(contact) or "there"
        if key == "name":
            return contact.name or contact.profile_name or "there"
        if key == "phone":
            return f"+{contact.wa_id}" if contact.wa_id else ""
        if key == "email" and "email" not in variables:
            return contact.email or ""
        if key.startswith("contact."):
            return str((contact.attributes or {}).get(key[8:], ""))
        found = variables.get(key)
        return "" if found is None else str(found)
    return VAR.sub(value, text)


# Checking answers ---------------------------------------------------------------------------

def parse_answer(kind: str, incoming: Incoming, data: dict) -> tuple[bool, str | None]:
    text = (incoming.text or "").strip()
    if kind == "media":
        return (True, text or "File received") if incoming.media else (False, None)
    if not text:
        return False, None
    if kind == "text":
        return True, text
    if kind == "number":
        clean = re.sub(r"[,\s₹$€£]", "", text)
        if not re.fullmatch(r"-?\d+(\.\d+)?", clean):
            return False, None
        number = float(clean)
        if (data.get("min") is not None and number < float(data["min"])) or \
                (data.get("max") is not None and number > float(data["max"])):
            return False, None
        return True, clean
    if kind == "email":
        return (True, text.lower()) if EMAIL.match(text) else (False, None)
    if kind == "phone":
        digits = re.sub(r"[\s()+-]", "", text)
        return (True, digits) if re.fullmatch(r"\d{7,15}", digits) else (False, None)
    if kind == "date":
        parsed = _date(text)
        return (True, parsed.strftime("%d %b %Y")) if parsed else (False, None)
    return True, text


def _date(text: str):
    low = text.lower().strip()
    today = now().date()
    if low == "today":
        return today
    if low == "tomorrow":
        return today + timedelta(days=1)
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d %b %Y", "%d %B %Y", "%b %d %Y",
                "%B %d %Y", "%d %b", "%d %B"):
        try:
            value = datetime.strptime(low.replace(",", ""), fmt).date()
        except ValueError:
            continue
        if "%Y" not in fmt and "%y" not in fmt:
            value = value.replace(year=today.year)
            if value < today:
                value = value.replace(year=today.year + 1)
        return value
    return None


def _field(rt: "Runner", field: str):
    contact, variables = rt.contact, rt.st.variables
    if field.startswith("var:"):
        return variables.get(field[4:])
    if field.startswith("attr:"):
        return (contact.attributes or {}).get(field[5:])
    return {
        "contact:name": contact.name or contact.profile_name,
        "contact:email": contact.email,
        "contact:phone": contact.wa_id,
        "contact:opted_out": "yes" if contact.opted_out else "no",
        "tags": list(contact.tags or []),
        "message": rt.last_text,
        "office_hours": auto.is_open(auto.settings_of(rt.owner)),
    }.get(field)


def check(rt: "Runner", rule: dict) -> bool:
    value, op, target = _field(rt, rule["field"]), rule["op"], (rule.get("value") or "").strip().lower()
    if rule["field"] == "office_hours":
        return bool(value) == (op != "closed")
    if rule["field"] == "tags":
        tags = {t.lower() for t in value or []}
        wanted = {t.strip().lower() for t in target.split(",") if t.strip()}
        if op in ("has", "contains", "equals"):
            return bool(wanted & tags)
        if op in ("not_has", "not_contains", "not_equals"):
            return not (wanted & tags)
        return bool(tags) if op == "is_set" else not tags
    text = "" if value is None else str(value).strip().lower()
    if op == "is_set":
        return bool(text)
    if op == "is_empty":
        return not text
    if op in ("gt", "lt"):
        try:
            number = float(re.sub(r"[,\s₹$€£]", "", text))
        except ValueError:
            return False
        return number > float(target) if op == "gt" else number < float(target)
    options = [t.strip() for t in target.split(",") if t.strip()] or [target]
    return {
        "equals": text in options,
        "not_equals": text not in options,
        "contains": any(o in text for o in options),
        "not_contains": not any(o in text for o in options),
        "starts_with": any(text.startswith(o) for o in options),
    }.get(op, False)


# Calling other systems ----------------------------------------------------------------------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _public(url: str) -> bool:
    """Only public internet addresses (not this server or its private network)."""
    if os.getenv("CHATBOT_ALLOW_PRIVATE_URLS") == "1":
        return True
    host = urllib.parse.urlsplit(url).hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved \
                or ip.is_unspecified:
            return False
    return True


def _pick(data, path: str):
    for part in path.strip().split("."):
        if isinstance(data, list) and part.lstrip("-").isdigit() and -len(data) <= int(part) < len(data):
            data = data[int(part)]
        elif isinstance(data, dict) and part in data:
            data = data[part]
        else:
            return None
    return data


def call_api(data: dict, fill) -> dict:
    """Makes the request of an API block. {"ok", "status", "values", "error"}."""
    url = fill(data["url"], quote=True)
    if not _public(url):
        return {"ok": False, "status": None, "values": {}, "error": "Only public internet addresses can be called"}
    body = None
    headers = {"User-Agent": "ChatDesk-Chatbot/1.0", "Accept": "application/json"}
    for h in data.get("headers") or []:
        headers[h["key"].strip()] = fill(h.get("value") or "")
    if data.get("body") and data["method"] != "GET":
        raw = fill(data["body"], json_safe=True)
        body = raw.encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=headers, method=data["method"])
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=8) as res:
            status, content = res.status, res.read(256 * 1024)
    except urllib.error.HTTPError as exc:
        status, content = exc.code, exc.read(256 * 1024) if exc.fp else b""
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return {"ok": False, "status": None, "values": {}, "error": f"Couldn't reach the address: {exc}"[:300]}
    try:
        parsed = json.loads(content.decode("utf-8", "replace") or "null")
    except ValueError:
        parsed = None
    values = {}
    for item in data.get("save") or []:
        found = _pick(parsed, item["path"])
        if found is not None:
            values[item["variable"]] = found if isinstance(found, str | int | float | bool) else json.dumps(found)[:1000]
    return {"ok": 200 <= status < 300, "status": status, "values": values,
            "error": None if 200 <= status < 300 else f"The address answered {status}"}


# What a block sends -------------------------------------------------------------------------

def compose(node: dict, contact, variables: dict) -> dict:
    """The message a block sends, with {{variables}} filled in (also what the test chat shows)."""
    data = node.get("data") or {}
    fill = lambda t: render(t, contact, variables)  # noqa: E731
    kind = node["type"]
    if kind == "message":
        reply = dict(data["reply"])
        reply["text"] = fill(reply.get("text"))
        for key in ("place", "address"):
            if reply.get(key):
                reply[key] = fill(reply[key])
        return reply
    if kind == "buttons":
        return {"type": "buttons", "text": fill(data["text"]), "header_type": data.get("header_type") or "none",
                "header": fill(data.get("header")) if data.get("header_type") == "text" else None,
                "media_key": data.get("media_key"), "media_filename": data.get("media_filename"),
                "footer": fill(data.get("footer")), "buttons": [b["title"] for b in data["buttons"]],
                "choices": [{"id": f"{node['id']}|{b['id']}", "title": b["title"]} for b in data["buttons"]]}
    if kind == "list":
        sections = [{"title": s.get("title"), "rows": [
            {"id": f"{node['id']}|{r['id']}", "title": r["title"], "description": r.get("description")}
            for r in s["rows"]]} for s in data["sections"]]
        return {"type": "list", "text": fill(data["text"]), "header": fill(data.get("header")),
                "footer": fill(data.get("footer")), "list_button": data["button"], "sections": sections,
                "rows": [r for s in sections for r in s["rows"]],
                "choices": [{"id": r["id"], "title": r["title"]} for s in sections for r in s["rows"]]}
    return {"type": "text", "text": fill(data.get("text"))}


def payload_of(spec: dict) -> tuple[dict, dict]:
    """(Meta payload without media ids, what the chat shows) for a composed message."""
    if spec["type"] not in ("buttons", "list"):
        return auto.build(spec, SimpleNamespace(name=None, profile_name=None))
    interactive: dict = {"body": {"text": spec["text"]}}
    if spec.get("footer"):
        interactive["footer"] = {"text": spec["footer"]}
    if spec["type"] == "buttons":
        if spec.get("header_type") == "text" and spec.get("header"):
            interactive["header"] = {"type": "text", "text": spec["header"]}
        elif spec.get("header_type") in ("image", "video", "document"):
            interactive["header"] = {"type": spec["header_type"], spec["header_type"]: {}}
        interactive["type"] = "button"
        interactive["action"] = {"buttons": [{"type": "reply", "reply": {"id": c["id"], "title": c["title"]}}
                                             for c in spec["choices"]]}
        shown = [{"type": "quick_reply", "text": b} for b in spec["buttons"]]
    else:
        if spec.get("header"):
            interactive["header"] = {"type": "text", "text": spec["header"]}
        interactive["type"] = "list"
        sections = []
        for s in spec["sections"]:
            rows = [{k: v for k, v in r.items() if v} for r in s["rows"]]
            section = {"rows": rows}
            section["title"] = (s.get("title") or spec["list_button"])[:24]
            sections.append(section)
        interactive["action"] = {"button": spec["list_button"], "sections": sections}
        shown = [{"type": "list", "text": spec["list_button"]}]
    header_text = spec.get("header") if spec.get("header_type", "text") == "text" else None
    body = "\n\n".join(filter(None, [header_text, spec["text"], spec.get("footer")]))
    return {"type": "interactive", "interactive": interactive}, {"type": "interactive", "text": body, "buttons": shown}


def choice_of(node: dict, incoming: Incoming) -> str | None:
    """The button / list option the customer picked: tapped, typed, or its number."""
    data = node.get("data") or {}
    items = data.get("buttons") if node["type"] == "buttons" else \
        [r for s in data.get("sections") or [] for r in s.get("rows") or []]
    if incoming.reply_id and incoming.reply_id.startswith(f"{node['id']}|"):
        wanted = incoming.reply_id.split("|", 1)[1]
        if any(i["id"] == wanted for i in items):
            return wanted
    text = " ".join((incoming.text or "").lower().split())
    for item in items:
        if text and text == " ".join(item["title"].lower().split()):
            return item["id"]
    if text.isdigit() and 1 <= int(text) <= len(items):
        return items[int(text) - 1]["id"]
    return None


# The runner ---------------------------------------------------------------------------------

class Runner:
    """Walks a flow from a block. Subclasses do the sending / saving (real chat or test chat)."""

    simulated = False

    def __init__(self, db: Session, owner: Customer, bot: WaChatbot, graph: Graph, settings: dict, contact, st):
        self.db, self.owner, self.bot, self.graph, self.settings = db, owner, bot, graph, settings
        self.contact, self.st = contact, st
        self.last_text = ""

    # overridden ---------------------------------------------------------------------------
    def send(self, node_id: str | None, spec: dict) -> None:
        raise NotImplementedError

    def note(self, node_id: str, text: str, kind: str = "note") -> None:
        pass

    def act(self, node_id: str, action: dict) -> None:
        raise NotImplementedError

    def handover(self, node_id: str | None, data: dict) -> None:
        raise NotImplementedError

    def delay(self, node_id: str, seconds: int, next_id: str | None) -> bool:
        """True when the run pauses here (a real chat); the test chat just carries on."""
        raise NotImplementedError

    def goto(self, node_id: str, chatbot_id: int) -> None:
        raise NotImplementedError

    def finish(self, reason: str, node_id: str | None = None) -> None:
        self.st.status, self.st.end_reason = "ended", reason
        self.st.wait = self.st.resume_at = None
        self.st.node_id = node_id or self.st.node_id

    # flow ---------------------------------------------------------------------------------
    def _enter(self, node_id: str) -> None:
        self.st.trail.append([node_id, None])
        if len(self.st.trail) > TRAIL_MAX:
            del self.st.trail[: len(self.st.trail) - TRAIL_MAX]

    def _leave(self, node_id: str, handle: str) -> str | None:
        if self.st.trail and self.st.trail[-1][0] == node_id:
            self.st.trail[-1][1] = handle
        return self.graph.next(node_id, handle)

    def fill(self, text: str | None, quote: bool = False, json_safe: bool = False) -> str:
        if not text:
            return text or ""
        if not (quote or json_safe):
            return render(text, self.contact, self.st.variables) or ""

        def value(m):
            plain = render(m.group(0), self.contact, self.st.variables) or ""
            if quote:
                return urllib.parse.quote(plain, safe="")
            return json.dumps(plain)[1:-1]
        return VAR.sub(value, text)

    def run(self, node_id: str | None) -> None:
        steps = 0
        while node_id:
            steps += 1
            if steps > MAX_STEPS:
                self.st.error = "The flow goes round in a loop without waiting for the customer"
                self.note(node_id, self.st.error, "error")
                self.finish("failed", node_id)
                return
            node = self.graph.node(node_id)
            if node is None:
                break
            self.st.node_id = node_id
            self._enter(node_id)
            kind, data = node["type"], node.get("data") or {}
            if kind == "start":
                node_id = self._leave(node_id, "out")
            elif kind == "message":
                self.send(node_id, compose(node, self.contact, self.st.variables))
                node_id = self._leave(node_id, "out")
            elif kind in ("buttons", "list", "question"):
                self.send(node_id, compose(node, self.contact, self.st.variables))
                self.st.wait, self.st.retries = "reply", 0
                return
            elif kind == "condition":
                results = [check(self, r) for r in data.get("rules") or []]
                passed = all(results) if data.get("match", "all") == "all" else any(results)
                self.note(node_id, f"Condition: {'yes' if passed else 'no'}", "condition")
                node_id = self._leave(node_id, "yes" if passed else "no")
            elif kind == "action":
                for action in data.get("actions") or []:
                    self.act(node_id, action)
                node_id = self._leave(node_id, "out")
            elif kind == "delay":
                seconds = int(data.get("amount") or 1) * UNIT_SECONDS.get(data.get("unit") or "seconds", 1)
                next_id = self._leave(node_id, "out")
                if self.delay(node_id, seconds, next_id):
                    return
                node_id = next_id
            elif kind == "webhook":
                result = call_api(data, self.fill)
                self.st.variables.update(result["values"])
                self.note(node_id, f"API request {'worked' if result['ok'] else 'failed'}"
                          + (f" ({result['status']})" if result["status"] else "")
                          + (f": {result['error']}" if result["error"] and not result["ok"] else ""), "webhook")
                node_id = self._leave(node_id, "ok" if result["ok"] else "fail")
            elif kind == "handover":
                self.handover(node_id, data)
                self.finish("handover", node_id)
                return
            elif kind == "goto":
                self.goto(node_id, int(data["chatbot_id"]))
                return
            elif kind == "end":
                if data.get("text"):
                    self.send(node_id, {"type": "text", "text": self.fill(data["text"])})
                if data.get("resolve"):
                    self.act(node_id, {"type": "resolve"})
                self.finish("completed", node_id)
                return
        self.finish("completed")

    def reply(self, incoming: Incoming) -> None:
        """The customer answered the block the bot waits at."""
        self.last_text = incoming.text or ""
        node = self.graph.node(self.st.node_id)
        if node is None:  # the block was deleted in a newer version
            self.finish("stopped")
            return
        data = node.get("data") or {}
        if node["type"] in ("buttons", "list"):
            choice = choice_of(node, incoming)
            if choice is not None:
                self.st.retries = 0
                if data.get("variable"):
                    items = data.get("buttons") if node["type"] == "buttons" else                         [r for sec in data.get("sections") or [] for r in sec.get("rows") or []]
                    self.st.variables[data["variable"]] = next(i["title"] for i in items if i["id"] == choice)
                prefix = "b" if node["type"] == "buttons" else "r"
                self.run(self._leave(node["id"], f"{prefix}:{choice}"))
                return
            if self.graph.next(node["id"], "other"):
                self.st.variables["last_message"] = incoming.text
                self.st.retries = 0
                self.run(self._leave(node["id"], "other"))
                return
            self._wrong(node, self.settings.get("invalid_text"))
            return
        if node["type"] == "question":
            ok, value = parse_answer(data.get("kind") or "text", incoming, data)
            if not ok:
                self._wrong(node, data.get("retry_text") or INVALID.get(data.get("kind") or "text"))
                return
            self.st.retries = 0
            self.st.variables[data["variable"]] = value
            self.save_answer(node["id"], data, value)
            self.run(self._leave(node["id"], "out"))
            return
        self.finish("stopped")

    def _wrong(self, node: dict, text: str | None) -> None:
        if self.st.retries < int(self.settings.get("max_retries", 2)):
            self.st.retries += 1
            if text:
                self.send(node["id"], {"type": "text", "text": self.fill(text)})
            if node["type"] in ("buttons", "list") or not (node.get("data") or {}).get("retry_text"):
                self.send(node["id"], compose(node, self.contact, self.st.variables))
            return
        self.st.retries = 0
        if node["type"] == "question" and self.graph.next(node["id"], "invalid"):
            self.run(self._leave(node["id"], "invalid"))
            return
        if self.settings.get("on_fail") == "handover":
            self.handover(node["id"], {"assign": "auto", "text": self.settings.get("handover_text")})
            self.finish("handover", node["id"])
        else:
            self.finish("invalid", node["id"])

    def save_answer(self, node_id: str, data: dict, value: str) -> None:
        target = data.get("save_to") or "none"
        if target == "name":
            self.contact.name = value[:150]
        elif target == "email" and EMAIL.match(value):
            self.contact.email = value[:255]
        elif target == "attribute":
            self.contact.attributes = {**(self.contact.attributes or {}), data["variable"]: value[:500]}
        if target != "none":
            self.note(node_id, f"Saved {data['variable']} to the contact", "action")

    def apply_action(self, action: dict) -> str:
        """Changes the contact (both in a real and a test chat). Returns what was done, in words."""
        c, kind = self.contact, action["type"]
        if kind == "add_tags":
            c.tags = list(dict.fromkeys([*(c.tags or []), *action["tags"]]))
            return f"Tag added: {', '.join(action['tags'])}"
        if kind == "remove_tags":
            drop = {t.lower() for t in action["tags"]}
            c.tags = [t for t in c.tags or [] if t.lower() not in drop]
            return f"Tag removed: {', '.join(action['tags'])}"
        value = self.fill(action.get("value"))
        if kind == "set_attribute":
            c.attributes = {**(c.attributes or {}), action["key"].strip(): value}
            return f"{action['key'].strip()} set to “{value}”"
        if kind == "set_name":
            c.name = value[:150] or c.name
            return f"Name set to “{value}”"
        if kind == "set_email":
            c.email = value[:255] or c.email
            return f"Email set to “{value}”"
        if kind == "set_variable":
            self.st.variables[action["key"].strip().lower()] = value
            return f"{{{{{action['key'].strip().lower()}}}}} = “{value}”"
        if kind == "opt_out":
            c.opted_out = True
            return "Opted out of marketing"
        if kind == "opt_in":
            c.opted_out = False
            return "Opted in to marketing"
        return "Chat marked resolved" if kind == "resolve" else kind


class SimRunner(Runner):
    """The test chat on the canvas: nothing is sent or saved, every step is described."""

    simulated = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.events: list[dict] = []

    def send(self, node_id, spec):
        self.events.append({"kind": "message", "node_id": node_id, "reply": spec})

    def note(self, node_id, text, kind="note"):
        self.events.append({"kind": kind, "node_id": node_id, "text": text})

    def act(self, node_id, action):
        self.note(node_id, self.apply_action(action), "action")

    def handover(self, node_id, data):
        text = data.get("text") if "text" in data else self.settings.get("handover_text")
        if text:
            self.send(node_id, {"type": "text", "text": self.fill(text)})
        who = {"auto": "your assignment rules", "member": "the chosen person", "team": "the chosen team",
               "nobody": "the inbox (unassigned)"}[data.get("assign") or "auto"]
        self.note(node_id, f"Handed over to {who}", "handover")

    def delay(self, node_id, seconds, next_id):
        self.events.append({"kind": "delay", "node_id": node_id, "seconds": seconds})
        return False

    def goto(self, node_id, chatbot_id):
        target = self.db.query(WaChatbot).filter(WaChatbot.id == chatbot_id,
                                                 WaChatbot.customer_id == self.owner.id).first()
        if target is None:
            self.note(node_id, "That chatbot no longer exists", "error")
            self.finish("failed", node_id)
            return
        self.note(node_id, f"Goes to chatbot “{target.name}”", "goto")
        self.bot, self.graph = target, Graph(target.published_graph or target.graph)
        self.settings = bot_settings(target, published=bool(target.published_graph))
        self.st.chatbot_id = target.id
        start = self.graph.start()
        self.run(start["id"] if start else None)

    def finish(self, reason, node_id=None):
        super().finish(reason, node_id)
        self.events.append({"kind": "end", "node_id": node_id, "reason": reason,
                            "text": f"The chatbot {END_LABELS.get(reason, reason)}"})


class LiveRunner(Runner):
    """A real chat: sends through WhatsApp and saves answers to the contact."""

    def __init__(self, db, owner, bot, graph, settings, contact, st, client: WhatsAppClient,
                 conversation: WaConversation, row: WaChatbotSession | None = None):
        super().__init__(db, owner, bot, graph, settings, contact, st)
        self.client, self.conversation, self.row = client, conversation, row

    def _media(self, key: str) -> tuple[str, str, str, object]:
        from app.modules.customer.templates.service import _sample_path

        path = _sample_path(self.owner.id, key)
        mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
        cache = dict(self.bot.media_cache or {})
        hit = cache.get(key)
        if hit and hit[1] > iso(now() - timedelta(days=MEDIA_ID_DAYS)):
            return hit[0], mime, path.name, path
        media_id = self.client.upload_media(path.read_bytes(), mime, path.name)
        cache[key] = [media_id, iso(now())]
        self.bot.media_cache = cache
        return media_id, mime, path.name, path

    def send(self, node_id, spec):
        from app.modules.customer.inbox import service as inbox

        payload, shown = payload_of(spec)
        fields: dict = {}
        media_path = None
        media_kind = spec.get("media_kind") if spec["type"] == "media" else \
            spec.get("header_type") if spec["type"] == "buttons" and spec.get("header_type") in (
                "image", "video", "document") else None
        if media_kind:
            media_id, mime, filename, media_path = self._media(spec["media_key"])
            filename = spec.get("media_filename") or filename
            part = payload[media_kind] if spec["type"] == "media" else payload["interactive"]["header"][media_kind]
            part["id"] = media_id
            if media_kind == "document":
                part["filename"] = filename
            fields = {"media_id": media_id, "media_mime": mime, "media_filename": filename,
                      "media_size": media_path.stat().st_size}
        raw = {"request": payload, "auto_reply": {"id": None, "name": self.bot.name},
               "chatbot": {"id": self.bot.id, "node_id": node_id, "session_id": self.st.id}}
        if shown.get("buttons"):
            raw["template"] = {"header_format": media_kind, "buttons": shown["buttons"]}
        if shown["type"] == "location":
            raw["location"] = shown["location"]
        message = inbox._outbound(self.db, self.owner, self.conversation, sent_by=SENDER, type=shown["type"],
                                  text=shown.get("text"), payload=raw, **fields)
        message.member_id = None  # not a person: doesn't count as the team answering
        if media_path is not None:
            inbox._cache_path(message).parent.mkdir(parents=True, exist_ok=True)
            inbox._cache_path(message).write_bytes(media_path.read_bytes())
        inbox._attempt(self.db, self.conversation, message,
                       lambda: self.client.send({"to": self.contact.wa_id, **payload}), reopen=False)
        if message.status == "failed":
            self.st.error = message.error_message
            raise Stop(message.error_message)

    def act(self, node_id, action):
        from app.modules.customer.team.assign import event

        text = self.apply_action(action)
        if action["type"] == "resolve":
            self.conversation.status, self.conversation.resolved_at = "resolved", now()
        if action["type"] in ("opt_out", "opt_in", "resolve"):
            event(self.db, self.conversation, "status", text, SENDER)

    def handover(self, node_id, data):
        from app.modules.customer.team import assign

        text = data.get("text") if "text" in data else self.settings.get("handover_text")
        if text:
            self.send(node_id, {"type": "text", "text": self.fill(text)})
        how = data.get("assign") or "auto"
        if how == "member":
            assign.assign(self.db, self.owner, self.conversation, data.get("member_id"), self.conversation.team_id,
                          SENDER)
        elif how == "team":
            assign.assign(self.db, self.owner, self.conversation, self.conversation.assignee_id,
                          data.get("team_id"), SENDER)
        elif how == "auto" and self.conversation.assignee_id is None:
            person = assign.pick_round_robin(self.db, self.owner)
            if person is not None:
                assign.assign(self.db, self.owner, self.conversation, person.id, self.conversation.team_id, SENDER)
        if self.conversation.status == "resolved":
            self.conversation.status, self.conversation.resolved_at = "open", None

    def delay(self, node_id, seconds, next_id):
        if next_id is None:
            return False
        self.st.wait, self.st.node_id, self.st.resume_at = "delay", next_id, now() + timedelta(seconds=seconds)
        return True

    def goto(self, node_id, chatbot_id):
        target = self.db.query(WaChatbot).filter(WaChatbot.id == chatbot_id, WaChatbot.customer_id == self.owner.id,
                                                 WaChatbot.published_graph.is_not(None)).first()
        self.finish("completed", node_id)
        _event(self.db, self.conversation, f"Chatbot “{self.bot.name}” finished")
        self.announced = True
        if target is not None:
            _save(self.db, self.row, self.st)
            start(self.db, self.owner, self.client, self.conversation, target, "goto",
                  variables=dict(self.st.variables))


# Real chats ---------------------------------------------------------------------------------

FIELDS = ("status", "end_reason", "node_id", "wait", "resume_at", "retries", "error")


def _state(row: WaChatbotSession) -> SimpleNamespace:
    """A working copy of a session. Sending commits midway, which would reload the row and drop
    changes made inside its JSON columns, so the runner works on this and `_save` writes it back."""
    return SimpleNamespace(id=row.id, **{f: getattr(row, f) for f in FIELDS},
                           variables=dict(row.variables or {}), trail=[list(t) for t in row.trail or []])


def _save(db: Session, row: WaChatbotSession, st: SimpleNamespace) -> None:
    for f in FIELDS:
        setattr(row, f, getattr(st, f))
    row.variables, row.trail = dict(st.variables), [list(t) for t in st.trail]
    row.last_activity_at = now()
    if row.status == "ended" and row.ended_at is None:
        row.ended_at = now()
    flag_modified(row, "variables")
    flag_modified(row, "trail")
    db.commit()


def _event(db: Session, conversation: WaConversation, text: str) -> None:
    from app.modules.customer.team.assign import event

    event(db, conversation, "bot", text, SENDER)


def _execute(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation,
             bot: WaChatbot, row: WaChatbotSession, step) -> None:
    graph, settings = Graph(bot.published_graph), bot_settings(bot)
    st = _state(row)
    runner = LiveRunner(db, owner, bot, graph, settings, conversation.contact, st, client, conversation, row)
    try:
        step(runner)
    except Stop:
        runner.finish("failed")
    except (WhatsAppError, OSError, KeyError, TypeError, ValueError) as exc:
        db.rollback()
        row = db.get(WaChatbotSession, row.id)
        st.error = str(exc)[:500]
        runner.finish("failed")
        logger.warning("Chatbot %s failed for conversation %s: %s", bot.id, conversation.id, exc)
    if st.status == "ended" and not getattr(runner, "announced", False):
        _event(db, conversation, f"Chatbot “{bot.name}” {END_LABELS.get(st.end_reason, st.end_reason)}")
    _save(db, row, st)


def start(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation, bot: WaChatbot,
          trigger: str, variables: dict | None = None, text: str = "") -> WaChatbotSession:
    st = WaChatbotSession(customer_id=owner.id, chatbot_id=bot.id, contact_id=conversation.contact_id,
                          conversation_id=conversation.id, version=bot.version, status="active", retries=0,
                          variables=variables or {}, trail=[], trigger=trigger, started_at=now(),
                          last_activity_at=now())
    db.add(st)
    db.flush()
    _event(db, conversation, f"Chatbot “{bot.name}” started")
    first = Graph(bot.published_graph).start()

    def go(runner):
        runner.last_text = text
        runner.run(first["id"] if first else None)
    _execute(db, owner, client, conversation, bot, st, go)
    return st


def active_session(db: Session, conversation_id: int) -> WaChatbotSession | None:
    return (db.query(WaChatbotSession).filter(WaChatbotSession.conversation_id == conversation_id,
                                              WaChatbotSession.status == "active")
            .order_by(WaChatbotSession.id.desc()).first())


def end(db: Session, st: WaChatbotSession, reason: str, note: str | None = None) -> None:
    st.status, st.end_reason, st.ended_at, st.wait, st.resume_at = "ended", reason, now(), None, None
    conversation = db.get(WaConversation, st.conversation_id)
    bot = db.get(WaChatbot, st.chatbot_id)
    if conversation is not None and bot is not None:
        _event(db, conversation, note or f"Chatbot “{bot.name}” {END_LABELS.get(reason, reason)}")
    db.commit()


def stop_for(db: Session, conversation: WaConversation, reason: str, note: str | None = None) -> bool:
    st = active_session(db, conversation.id)
    if st is None:
        return False
    end(db, st, reason, note)
    return True


def live_bots(db: Session, owner_id: int) -> list[WaChatbot]:
    return (db.query(WaChatbot).filter(WaChatbot.customer_id == owner_id, WaChatbot.active.is_(True),
                                       WaChatbot.published_graph.is_not(None))
            .order_by(WaChatbot.id).all())


def _cooled(db: Session, bot: WaChatbot, contact_id: int) -> bool:
    if not bot.restart_minutes:
        return True
    last = (db.query(WaChatbotSession.started_at).filter(WaChatbotSession.chatbot_id == bot.id,
                                                         WaChatbotSession.contact_id == contact_id)
            .order_by(WaChatbotSession.started_at.desc()).first())
    return last is None or last[0] <= now() - timedelta(minutes=bot.restart_minutes)


def keyword_bot(bots: list[WaChatbot], text: str, exact_only: bool = False) -> WaChatbot | None:
    clean = " ".join((text or "").lower().split())
    if not clean:
        return None
    for bot in bots:
        if bot.trigger != "keyword":
            continue
        if exact_only and clean in (bot.keywords or []):
            return bot
        if not exact_only and auto.keyword_matches(bot, clean):
            return bot
    return None


def trigger_for(db: Session, bots: list[WaChatbot], message: WaMessage | None, text: str, first: bool,
                contact_id: int | None) -> WaChatbot | None:
    """The chatbot a message starts (when no chatbot is running in the chat)."""
    def ok(bot):
        return contact_id is None or _cooled(db, bot, contact_id)
    referral = (message.payload or {}).get("referral") if message is not None else None
    if referral:
        for bot in bots:
            if bot.trigger == "ad" and ok(bot):
                return bot
    bot = keyword_bot(bots, text)
    if bot is not None and ok(bot):
        return bot
    if first:
        for bot in bots:
            if bot.trigger == "new_chat" and ok(bot):
                return bot
    return None


def has_fallback(db: Session, owner_id: int) -> bool:
    return any(bot.trigger == "any" for bot in live_bots(db, owner_id))


def fallback_bot(db: Session, owner_id: int, contact_id: int) -> WaChatbot | None:
    """An "any message" chatbot, used where the default automatic reply would answer."""
    for bot in live_bots(db, owner_id):
        if bot.trigger == "any" and _cooled(db, bot, contact_id):
            return bot
    return None


def incoming_of(message: WaMessage) -> Incoming:
    raw = message.payload or {}
    reply_id = None
    if message.type == "interactive":
        inter = raw.get("interactive") or {}
        reply_id = (inter.get("button_reply") or inter.get("list_reply") or {}).get("id")
    return Incoming(text=message.text or "", reply_id=reply_id, media=message.type in MEDIA_TYPES)


def on_message(db: Session, owner: Customer, client: WhatsAppClient, conversation: WaConversation,
               message: WaMessage, first: bool, greet=None) -> bool:
    """Lets a chatbot answer a new message. True when one did (then automatic replies stay quiet)."""
    bots = live_bots(db, owner.id)
    text = message.text or ""
    clean = " ".join(text.lower().split())
    st = active_session(db, conversation.id)
    if st is not None:
        bot = db.get(WaChatbot, st.chatbot_id)
        if bot is None or not bot.active or not bot.published_graph:
            end(db, st, "stopped")
            st = None
        elif st.wait == "reply" and st.last_activity_at < now() - timedelta(
                minutes=bot_settings(bot)["timeout_minutes"]):
            end(db, st, "timeout")
            st = None
    if st is not None:
        settings = bot_settings(bot)
        if clean and clean in settings["exit_keywords"]:
            def leave(runner):
                runner.handover(st.node_id, {"assign": "auto", "text": settings.get("handover_text")})
                runner.finish("handover")
            _execute(db, owner, client, conversation, bot, st, leave)
            return True
        if st.wait == "delay":
            return True  # it carries on by itself in a moment
        other = keyword_bot(bots, text, exact_only=True)
        node = Graph(bot.published_graph).node(st.node_id)
        if other is not None and not (node and node["type"] in ("buttons", "list")
                                      and choice_of(node, incoming_of(message))):
            end(db, st, "replaced")
            start(db, owner, client, conversation, other, "keyword", text=text)
            return True
        _execute(db, owner, client, conversation, bot, st, lambda r: r.reply(incoming_of(message)))
        return True
    bot = trigger_for(db, bots, message, text, first, conversation.contact_id)
    if bot is None:
        return False
    if greet is not None and first and bot.trigger != "new_chat":
        greet()
    start(db, owner, client, conversation, bot, "ad" if bot.trigger == "ad" else bot.trigger, text=text)
    return True


# Delays and timeouts ------------------------------------------------------------------------

def _client_for(db: Session, owner_id: int) -> WhatsAppClient | None:
    from app.core.crypto import decrypt_secret
    from app.modules.customer.whatsapp.models import WhatsAppAccount

    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == owner_id,
                                               WhatsAppAccount.status == "connected").first()
    if account is None:
        return None
    return WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "")


def run_due(db: Session | None = None) -> int:
    """Carries on chatbots whose delay is over and closes those the customer left. Returns sessions touched."""
    from app.core.database import SessionLocal

    own = db is None
    db = db or SessionLocal()
    touched = 0
    try:
        due = (db.query(WaChatbotSession).filter(WaChatbotSession.status == "active",
                                                 WaChatbotSession.wait == "delay",
                                                 WaChatbotSession.resume_at <= now())
               .order_by(WaChatbotSession.resume_at).limit(100).all())
        for st in due:
            # claim it, so two workers never run the same step
            claimed = (db.query(WaChatbotSession).filter(WaChatbotSession.id == st.id, WaChatbotSession.wait == "delay")
                       .update({"wait": None}, synchronize_session=False))
            db.commit()
            if not claimed:
                continue
            db.refresh(st)
            bot, owner = db.get(WaChatbot, st.chatbot_id), db.get(Customer, st.customer_id)
            conversation = db.get(WaConversation, st.conversation_id)
            client = _client_for(db, st.customer_id)
            if bot is None or not bot.published_graph or client is None or conversation is None:
                end(db, st, "stopped")
                continue
            _execute(db, owner, client, conversation, bot, st, lambda r, n=st.node_id: r.run(n))
            touched += 1
        waiting = (db.query(WaChatbotSession).filter(WaChatbotSession.status == "active",
                                                     WaChatbotSession.wait == "reply")
                   .order_by(WaChatbotSession.last_activity_at).limit(500).all())
        for st in waiting:
            bot = db.get(WaChatbot, st.chatbot_id)
            if bot is None:
                continue
            settings = bot_settings(bot)
            if st.last_activity_at > now() - timedelta(minutes=settings["timeout_minutes"]):
                continue
            conversation = db.get(WaConversation, st.conversation_id)
            client = _client_for(db, st.customer_id) if settings.get("timeout_text") else None
            if client is not None and conversation is not None:
                owner = db.get(Customer, st.customer_id)
                runner = LiveRunner(db, owner, bot, Graph(bot.published_graph), settings, conversation.contact, st,
                                    client, conversation)
                try:
                    runner.send(st.node_id, {"type": "text", "text": runner.fill(settings["timeout_text"])})
                except (Stop, WhatsAppError, OSError):
                    pass
            end(db, st, "timeout")
            touched += 1
    finally:
        if own:
            db.close()
    return touched


_ticker: threading.Thread | None = None
TICK_SECONDS = 3


def _tick() -> None:
    while True:
        time.sleep(TICK_SECONDS)
        try:
            run_due()
        except Exception:  # noqa: BLE001
            logger.exception("Chatbot ticker failed")


def start_ticker() -> None:
    """Runs delays and timeouts in the API process. Off when CHATBOT_WORKER=off (tests)."""
    global _ticker
    if os.getenv("CHATBOT_WORKER", "on").lower() in ("off", "0", "false"):
        return
    if _ticker is None or not _ticker.is_alive():
        _ticker = threading.Thread(target=_tick, name="chatbot-ticker", daemon=True)
        _ticker.start()


def simulate(db: Session, owner: Customer, bot: WaChatbot, graph_raw: dict, settings: dict, state: dict | None,
             incoming: Incoming | None, contact: WaContact) -> dict:
    """One step of a test chat. Returns what happened and the new state."""
    fresh = not state or state.get("status") != "active"
    st = SimpleNamespace(status="active", end_reason=None, node_id=None, wait=None, resume_at=None, retries=0,
                         variables={}, trail=[], error=None, chatbot_id=bot.id)
    if not fresh:
        for key in ("node_id", "wait", "retries", "variables", "trail", "chatbot_id"):
            if key in state:
                setattr(st, key, state[key])
    target = bot
    if st.chatbot_id != bot.id:  # moved on to another chatbot with a Go to block
        target = db.query(WaChatbot).filter(WaChatbot.id == st.chatbot_id, WaChatbot.customer_id == owner.id).first() \
            or bot
    if target is not bot:
        graph_raw, settings = target.published_graph or target.graph, bot_settings(target, bool(target.published_graph))
    runner = SimRunner(db, owner, target, Graph(graph_raw), settings, contact, st)
    if fresh:
        first = runner.graph.start()
        if first is None:
            runner.note(None, "Add a Start block first", "error")
        else:
            runner.last_text = incoming.text if incoming else ""
            runner.run(first["id"])
    elif incoming is not None:
        clean = " ".join((incoming.text or "").lower().split())
        if clean and clean in settings.get("exit_keywords", []):
            runner.handover(st.node_id, {"assign": "auto", "text": settings.get("handover_text")})
            runner.finish("handover")
        else:
            runner.reply(incoming)
    waiting = None
    node = runner.graph.node(st.node_id) if st.status == "active" else None
    if node is not None and st.wait == "reply":
        waiting = {"node_id": node["id"], "type": node["type"],
                   "kind": (node.get("data") or {}).get("kind") if node["type"] == "question" else None}
    contact_out = {"name": contact.name, "email": contact.email, "tags": list(contact.tags or []),
                   "attributes": dict(contact.attributes or {}), "opted_out": bool(contact.opted_out)}
    return {"events": runner.events, "waiting": waiting, "contact": contact_out,
            "state": {"status": st.status, "end_reason": st.end_reason, "node_id": st.node_id, "wait": st.wait,
                      "retries": st.retries, "variables": st.variables, "trail": st.trail,
                      "chatbot_id": st.chatbot_id}}
