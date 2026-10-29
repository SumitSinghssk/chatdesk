"""AI for diagrams: draw one from a description, summarise one, suggest missing steps.

It uses the AI the business already connected for its AI agent (Claude, ChatGPT, Gemini…): the same key and
model, so there's nothing new to set up or pay for. The model answers in JSON; what comes back is checked
and trimmed before anything is drawn, and the browser lays it out.
"""

import json
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.modules.customer.account.models import Customer

SHAPES = {"terminal", "process", "decision", "io", "document", "database", "person", "note", "mind"}
MAX_NODES = 60
MAX_EDGES = 90
MAX_LABEL = 80

DRAW = """You turn a description into a diagram for a small business tool. Reply with ONE JSON object and nothing else.

Shape of the reply:
{"title": "short name", "kind": "flowchart" | "mindmap",
 "nodes": [{"id": "n1", "label": "...", "shape": "..."}],
 "edges": [{"from": "n1", "to": "n2", "label": "optional"}]}

Rules:
- Use the kind asked for. If it says "any", pick a flowchart for a process or steps, a mind map for ideas or topics.
- Flowchart shapes: "terminal" (start and end), "process" (a step), "decision" (a yes/no question), "io" (data in or
  out, e.g. a message received), "document", "database", "person". Start with a terminal and end with one or more.
  Every decision has two or more outgoing edges with short labels such as "Yes" and "No".
- Mind map: every node's shape is "mind"; the first node is the centre; each edge goes from a parent to a child;
  2 to 7 main branches, each with 1 to 5 ideas.
- 4 to 40 nodes. Labels are short (2 to 8 words), in the language of the description. No numbering in labels.
- ids are unique, like n1, n2…; edges only use ids that exist."""

SUMMARY = """You explain a diagram to someone who hasn't seen it. Write 3 to 6 short sentences in plain words: what it is
for, the main path from start to end, and the choices along the way. No headings, no lists, no JSON. Reply in the
language of the diagram's labels."""

SUGGEST = """You review a diagram and point out steps that are missing: cases not handled, a missing reply, a dead end,
a decision with only one way out. Reply with ONE JSON object and nothing else:
{"suggestions": [{"label": "the step to add, 2 to 8 words", "after": "id of the shape it follows, or null",
                  "why": "one short sentence"}]}
At most 6 suggestions, the most useful first. Use only ids that are in the diagram. If nothing is missing, reply
{"suggestions": []}. Write in the language of the diagram's labels."""


def connections(db: Session, ws: Customer) -> list[dict]:
    """The AI the person's numbers have connected and checked, with the model each AI agent uses."""
    from app.modules.customer.ai_agent.models import AiAgent, AiConnection

    numbers = [n.id for n in (getattr(ws, "numbers", None) or [ws])]
    conns = (db.query(AiConnection).filter(AiConnection.customer_id.in_(numbers), AiConnection.status != "failed")
             .order_by(AiConnection.id).all())
    agents = db.query(AiAgent).filter(AiAgent.customer_id.in_(numbers), AiAgent.connection_id.isnot(None)).all()
    out = []
    for c in conns:
        chosen = next((a.model for a in agents if a.connection_id == c.id and a.model), None)
        models = list(c.models or [])
        model = chosen or (models[0] if models else None)
        if model:
            out.append({"id": c.id, "label": c.label, "provider": c.provider, "model": model,
                        "models": models[:50]})
    return out


def _ask(db: Session, ws: Customer, system: str, prompt: str, connection_id: int | None, model: str | None,
         max_tokens: int) -> str:
    from app.modules.customer.ai_agent import providers
    from app.modules.customer.ai_agent.models import AiConnection

    options = connections(db, ws)
    if not options:
        raise HTTPException(409, detail="Connect an AI first: AI agent → Connections (Claude, ChatGPT, Gemini…).")
    pick = next((o for o in options if o["id"] == connection_id), options[0])
    use_model = model if model and (model in pick["models"] or model == pick["model"]) else pick["model"]
    conn = db.get(AiConnection, pick["id"])
    try:
        result = providers.chat(conn.provider, decrypt_secret(conn.api_key) or "", conn.base_url, use_model, system,
                                "", [{"role": "user", "content": prompt}], max_tokens=max_tokens)
    except providers.ProviderError as exc:
        raise HTTPException(502, detail=f"The AI couldn't answer: {exc}") from exc
    return result.text or ""


def _json(text: str) -> dict:
    """The JSON object in a reply (models sometimes wrap it in ``` fences or a sentence)."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise HTTPException(502, detail="The AI's answer wasn't a diagram. Try describing it again.")
    try:
        return json.loads(text[start:end + 1])
    except ValueError:
        cleaned = re.sub(r",\s*([}\]])", r"\1", text[start:end + 1])  # trailing commas
        try:
            return json.loads(cleaned)
        except ValueError as exc:
            raise HTTPException(502, detail="The AI's answer wasn't a diagram. Try describing it again.") from exc


def _label(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:MAX_LABEL]


def draw(db: Session, ws: Customer, prompt: str, kind: str, connection_id: int | None, model: str | None) -> dict:
    ask = f"Kind: {kind}\n\nDescription:\n{prompt}"
    raw = _json(_ask(db, ws, DRAW, ask, connection_id, model, 2500))
    out_kind = raw.get("kind") if raw.get("kind") in ("flowchart", "mindmap") else (
        "mindmap" if kind == "mindmap" else "flowchart")
    nodes, ids = [], set()
    for n in raw.get("nodes") or []:
        if not isinstance(n, dict) or len(nodes) >= MAX_NODES:
            continue
        node_id = re.sub(r"[^\w-]", "", str(n.get("id") or ""))[:20]
        label = _label(n.get("label"))
        if not node_id or node_id in ids or not label:
            continue
        shape = "mind" if out_kind == "mindmap" else (n.get("shape") if n.get("shape") in SHAPES - {"mind"} else
                                                      "process")
        ids.add(node_id)
        nodes.append({"id": node_id, "label": label, "shape": shape})
    edges, seen = [], set()
    for e in raw.get("edges") or []:
        if not isinstance(e, dict) or len(edges) >= MAX_EDGES:
            continue
        a, b = str(e.get("from") or ""), str(e.get("to") or "")
        if a in ids and b in ids and a != b and (a, b) not in seen:
            seen.add((a, b))
            edges.append({"from": a, "to": b, "label": _label(e.get("label"))[:40]})
    if len(nodes) < 2:
        raise HTTPException(502, detail="The AI didn't draw enough to make a diagram. Add a bit more detail.")
    return {"title": _label(raw.get("title"))[:150] or "New diagram", "kind": out_kind, "nodes": nodes,
            "edges": edges}


def _outline(content: dict) -> str:
    """The diagram as text for the AI: shapes with their ids and labels, then the lines."""
    nodes = (content or {}).get("nodes", {})
    rows = []
    for n in list(nodes.values())[:300]:
        data = n.get("data") or {}
        label = _label(data.get("label")) or (data.get("record") or {}).get("type") or ""
        if data.get("shape") in ("frame", "image") and not label:
            continue
        rows.append(f'{n.get("id")}: [{data.get("shape", "process")}] {label}')
    lines = []
    for e in list((content or {}).get("edges", {}).values())[:500]:
        label = _label((e.get("data") or {}).get("label"))
        lines.append(f'{e.get("source")} -> {e.get("target")}{f" ({label})" if label else ""}')
    return "Shapes:\n" + "\n".join(rows) + "\n\nLines:\n" + ("\n".join(lines) or "(none)")


def summary(db: Session, ws: Customer, content: dict) -> str:
    if not (content or {}).get("nodes"):
        raise HTTPException(422, detail="There's nothing on the diagram to explain yet")
    return _ask(db, ws, SUMMARY, _outline(content), None, None, 700).strip()[:3000]


def suggest(db: Session, ws: Customer, content: dict) -> list[dict]:
    if not (content or {}).get("nodes"):
        raise HTTPException(422, detail="Draw a few steps first")
    ids = set((content or {}).get("nodes", {}).keys())
    raw = _json(_ask(db, ws, SUGGEST, _outline(content), None, None, 1200))
    out = []
    for s in raw.get("suggestions") or []:
        if not isinstance(s, dict) or not _label(s.get("label")):
            continue
        after = s.get("after") if s.get("after") in ids else None
        out.append({"label": _label(s.get("label")), "after": after, "why": _label(s.get("why"))[:200]})
    return out[:6]
