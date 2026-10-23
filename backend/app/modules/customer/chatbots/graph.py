"""Reading the canvas graph: where each block leads, and what's wrong with a flow before it goes live."""

import re

from pydantic import ValidationError

from app.modules.customer.chatbots.schemas import NODE_DATA

BUILTIN = {"first_name", "name", "phone", "email"}
VAR = re.compile(r"\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}", re.I)
TERMINAL = ("handover", "goto", "end")
LABELS = {"start": "Start", "message": "Message", "buttons": "Buttons", "list": "List", "question": "Question",
          "condition": "Condition", "action": "Action", "handover": "Hand over", "delay": "Delay",
          "webhook": "API request", "goto": "Go to chatbot", "end": "End"}


class Graph:
    def __init__(self, raw: dict | None):
        raw = raw or {}
        self.nodes: dict[str, dict] = {n["id"]: n for n in raw.get("nodes") or []}
        self.edges: list[dict] = list(raw.get("edges") or [])
        self._next = {(e["source"], e.get("sourceHandle") or "out"): e["target"] for e in self.edges}

    def start(self) -> dict | None:
        return next((n for n in self.nodes.values() if n["type"] == "start"), None)

    def node(self, node_id: str | None) -> dict | None:
        return self.nodes.get(node_id) if node_id else None

    def next(self, node_id: str, handle: str = "out") -> str | None:
        target = self._next.get((node_id, handle))
        return target if target in self.nodes else None

    def label(self, node_id: str | None) -> str:
        node = self.node(node_id)
        if node is None:
            return "a removed block"
        return (node.get("data") or {}).get("label") or LABELS.get(node["type"], node["type"])


def handles(node: dict) -> list[str]:
    """The outputs a block has (each can connect to one next block)."""
    data = node.get("data") or {}
    kind = node["type"]
    if kind == "buttons":
        return [f"b:{b.get('id')}" for b in data.get("buttons") or []] + ["other"]
    if kind == "list":
        return [f"r:{r.get('id')}" for s in data.get("sections") or [] for r in s.get("rows") or []] + ["other"]
    if kind == "condition":
        return ["yes", "no"]
    if kind == "webhook":
        return ["ok", "fail"]
    if kind == "question":
        return ["out", "invalid"]
    if kind in TERMINAL:
        return []
    return ["out"]


def _texts(node: dict) -> list[str]:
    data = node.get("data") or {}
    out = [data.get("text"), data.get("header"), data.get("footer"), (data.get("reply") or {}).get("text")]
    if node["type"] == "webhook":
        out += [data.get("url"), data.get("body")] + [h.get("value") for h in data.get("headers") or []]
    if node["type"] == "action":
        out += [a.get("value") for a in data.get("actions") or []]
    return [t for t in out if isinstance(t, str)]


def _defines(node: dict) -> set[str]:
    data = node.get("data") or {}
    if node["type"] in ("question", "buttons", "list") and data.get("variable"):
        return {data["variable"]}
    if node["type"] == "webhook":
        return {s.get("variable") for s in data.get("save") or [] if s.get("variable")}
    if node["type"] == "action":
        return {a.get("key", "").strip().lower() for a in data.get("actions") or [] if a.get("type") == "set_variable"}
    return set()


def _message(exc: ValidationError) -> str:
    err = exc.errors()[0]
    msg = str(err.get("msg", "Check this block")).removeprefix("Value error, ")
    where = [str(p) for p in err.get("loc", ()) if not isinstance(p, int)]
    blank = err.get("type") == "string_type" and err.get("input") is None
    if (blank or err.get("type") in ("missing", "string_too_short", "too_short")) and where:
        names = {"text": "the message", "buttons": "a button", "title": "the text", "rows": "an option",
                 "sections": "an option", "variable": "a name for the answer", "url": "the address",
                 "button": "the list button text", "rules": "a rule", "actions": "an action", "reply": "the message"}
        return f"Add {names.get(where[-1], where[-1])}"
    if err.get("type") == "string_too_long" and where:
        return f"{where[-1].capitalize()}: {msg}"
    return msg


def problems(raw: dict | None, chatbot_ids: set[int] | None = None, self_id: int | None = None) -> dict:
    """{"errors": [...], "warnings": [...]}, each {"node_id", "message"}. Errors block publishing."""
    g = Graph(raw)
    errors: list[dict] = []
    warnings: list[dict] = []
    starts = [n for n in g.nodes.values() if n["type"] == "start"]
    if len(starts) != 1:
        errors.append({"node_id": None, "message": "A chatbot needs exactly one Start block"})
    for node in g.nodes.values():
        model = NODE_DATA.get(node["type"])
        if model is not None:
            try:
                model(**(node.get("data") or {}))
            except ValidationError as exc:
                errors.append({"node_id": node["id"], "message": _message(exc)})
            except (TypeError, ValueError) as exc:
                errors.append({"node_id": node["id"], "message": str(exc)[:200]})
        if node["type"] == "goto":
            target = (node.get("data") or {}).get("chatbot_id")
            if target is not None and target == self_id:
                errors.append({"node_id": node["id"], "message": "A chatbot can't go to itself; connect back instead"})
            elif target is not None and chatbot_ids is not None and target not in chatbot_ids:
                errors.append({"node_id": node["id"], "message": "That chatbot no longer exists"})

    seen = set()
    for edge in g.edges:
        handle = edge.get("sourceHandle") or "out"
        source = g.node(edge["source"])
        if source is None or edge["target"] not in g.nodes:
            continue  # dangling edges are dropped when saving
        if handle not in handles(source):
            continue
        if (edge["source"], handle) in seen:
            errors.append({"node_id": edge["source"], "message": "One output connects to two blocks"})
        seen.add((edge["source"], handle))

    if len(starts) == 1:
        start = starts[0]
        if not g.next(start["id"]):
            errors.append({"node_id": start["id"], "message": "Connect Start to the first block"})
        reachable, todo = set(), [start["id"]]
        while todo:
            current = todo.pop()
            if current in reachable:
                continue
            reachable.add(current)
            todo += [g.next(current, h) for h in handles(g.nodes[current]) if g.next(current, h)]
        for node in g.nodes.values():
            if node["id"] not in reachable:
                warnings.append({"node_id": node["id"], "message": "Not connected: customers never reach this block"})
        defined = BUILTIN | {v for n in g.nodes.values() for v in _defines(n)}
        for node in g.nodes.values():
            if node["id"] not in reachable:
                continue
            for text in _texts(node):
                for name in VAR.findall(text):
                    if not name.lower().startswith("contact.") and name.lower() not in defined:
                        warnings.append({"node_id": node["id"],
                                         "message": f"{{{{{name}}}}} is never set, so it will be empty"})
            if node["type"] in ("buttons", "list"):
                loose = [h for h in handles(node)[:-1] if not g.next(node["id"], h)]
                if loose:
                    what = "button" if node["type"] == "buttons" else "option"
                    warnings.append({"node_id": node["id"],
                                     "message": f"{len(loose)} {what}{'s' if len(loose) > 1 else ''} not connected: "
                                                "the chatbot ends when tapped"})
    return {"errors": errors, "warnings": warnings}


def clean(raw: dict) -> dict:
    """Drops connections to blocks or outputs that no longer exist (left over after deleting things)."""
    g = Graph(raw)
    edges, seen = [], set()
    for edge in g.edges:
        source = g.node(edge["source"])
        handle = edge.get("sourceHandle") or "out"
        if source is None or edge["target"] not in g.nodes or handle not in handles(source):
            continue
        if (edge["source"], handle) in seen or edge["source"] == edge["target"]:
            continue
        seen.add((edge["source"], handle))
        edges.append({"id": edge["id"], "source": edge["source"], "sourceHandle": handle, "target": edge["target"]})
    return {"nodes": list(g.nodes.values()), "edges": edges}
