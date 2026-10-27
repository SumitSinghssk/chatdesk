import copy
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.diagrams import live
from app.modules.customer.diagrams.models import (Diagram, DiagramActivity, DiagramComment, DiagramMember, DiagramOp,
                                                  DiagramStar, DiagramVersion)
from app.modules.customer.diagrams.schemas import (AccessSchema, CommentSchema, DiagramSchema, DiagramUpdateSchema,
                                                   GuestCommentSchema, LinkSchema, Op)
from app.modules.customer.team.access import actor, role_of, root_id
from app.shared.enums import Status
from app.shared.utils.datetime import iso, now

LEVELS = {"view": 1, "comment": 2, "edit": 3, "manage": 4}
MAX_NODES = 3000
MAX_EDGES = 6000
MAX_ELEMENT = 20_000  # bytes of one shape or line
MAX_CONTENT = 3_000_000  # bytes of the whole diagram
KEEP_OPS = 2000  # changes kept for catching up; older tabs reload the diagram instead
AUTO_VERSION_EVERY = timedelta(minutes=15)
COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5",
          "#059669"]
GUEST_PASS_HOURS = 12
EMPTY = {"nodes": {}, "edges": {}}


# People ---------------------------------------------------------------------------------------

def color_of(key: int | str) -> str:
    digest = hashlib.sha256(str(key).encode()).digest()
    return COLORS[digest[0] % len(COLORS)]


def me(ws: Customer) -> dict:
    person = actor(ws)
    return {"id": person.id, "name": person.name or person.email, "color": color_of(person.id), "guest": False}


def _name(ws: Customer) -> str:
    return me(ws)["name"]


def _level(db: Session, ws: Customer, d: Diagram) -> str | None:
    person = actor(ws)
    if role_of(ws) in ("owner", "admin") or d.created_by_id == person.id:
        return "manage"
    member = db.query(DiagramMember).filter(DiagramMember.diagram_id == d.id,
                                            DiagramMember.member_id == person.id).first()
    if member is not None:
        return member.role
    return None if d.team_access == "private" else d.team_access


def get(db: Session, ws: Customer, diagram_id: int, need: str = "view", lock: bool = False) -> tuple[Diagram, str]:
    q = db.query(Diagram).filter(Diagram.id == diagram_id, Diagram.workspace_id == root_id(ws))
    d = (q.with_for_update() if lock else q).first()
    level = _level(db, ws, d) if d is not None else None
    if level is None:
        raise HTTPException(404, detail="Diagram not found")
    if LEVELS[level] < LEVELS[need]:
        verb = {"comment": "comment on", "edit": "edit", "manage": "change the settings of"}[need]
        raise HTTPException(403, detail=f"You can't {verb} this diagram. Ask its owner for access.")
    return d, level


def _activity(db: Session, d: Diagram, kind: str, who: str | None, guest: bool = False, detail: str | None = None,
              group: timedelta | None = None) -> None:
    """Adds a line to the activity list. `group`: skip if the same person did the same within this time."""
    if group is not None and db.query(DiagramActivity.id).filter(
            DiagramActivity.diagram_id == d.id, DiagramActivity.kind == kind, DiagramActivity.actor == who,
            DiagramActivity.at >= now() - group).first():
        return
    db.add(DiagramActivity(diagram_id=d.id, kind=kind, actor=who, guest=guest, detail=detail, at=now()))


# Content ----------------------------------------------------------------------------------------

def _clean(content: dict | None) -> dict:
    """A diagram's content in its stored shape, whatever was sent (e.g. a template)."""
    content = content if isinstance(content, dict) else {}
    out = {"nodes": {}, "edges": {}}
    for key in ("nodes", "edges"):
        items = content.get(key) or {}
        if isinstance(items, list):
            items = {str(i.get("id")): i for i in items if isinstance(i, dict) and i.get("id")}
        for item_id, item in items.items():
            if isinstance(item, dict) and 0 < len(str(item_id)) <= 64:
                out[key][str(item_id)] = {**item, "id": str(item_id)}
    _drop_loose_edges(out)
    _check_size(out)
    return out


def _drop_loose_edges(content: dict) -> list[str]:
    """Removes lines whose shape at either end is gone. Returns their ids."""
    nodes = content["nodes"]
    loose = [i for i, e in content["edges"].items() if e.get("source") not in nodes or e.get("target") not in nodes]
    for i in loose:
        content["edges"].pop(i, None)
    return loose


def _check_size(content: dict) -> None:
    if len(content["nodes"]) > MAX_NODES:
        raise HTTPException(422, detail=f"A diagram can have up to {MAX_NODES} shapes")
    if len(content["edges"]) > MAX_EDGES:
        raise HTTPException(422, detail=f"A diagram can have up to {MAX_EDGES} lines")
    if len(json.dumps(content, separators=(",", ":"))) > MAX_CONTENT:
        raise HTTPException(422, detail="This diagram is too big. Split it into two, or remove large images.")


def _preview(content: dict) -> dict:
    """A small outline of the diagram for the list's thumbnails."""
    nodes = []
    for n in list((content or {}).get("nodes", {}).values())[:150]:
        pos = n.get("position") or {}
        data = n.get("data") or {}
        nodes.append({"id": n.get("id"), "x": pos.get("x", 0), "y": pos.get("y", 0), "w": n.get("width") or 160,
                      "h": n.get("height") or 60, "shape": data.get("shape") or n.get("type"),
                      "fill": data.get("fill"), "parent": n.get("parentId")})
    edges = [[e.get("source"), e.get("target")] for e in list((content or {}).get("edges", {}).values())[:250]]
    return {"nodes": nodes, "edges": edges}


def apply_ops(diagram_id: int, ws: Customer | None, ops: list[Op], client_id: str | None, who: dict,
              db: Session) -> dict:
    """Saves a batch of changes (the caller has checked edit access), then tells everyone. Returns the new
    sequence number and the changes as applied (including lines removed with their shapes)."""
    d = db.query(Diagram).filter(Diagram.id == diagram_id).with_for_update().one()
    content = {"nodes": dict((d.content or {}).get("nodes") or {}), "edges": dict((d.content or {}).get("edges") or {})}
    applied = []
    for op in ops:
        target = content["nodes" if op.k == "n" else "edges"]
        if op.v is None:
            target.pop(op.id, None)
            applied.append({"k": op.k, "id": op.id, "v": None})
            continue
        value = {**op.v, "id": op.id}
        if len(json.dumps(value, separators=(",", ":"))) > MAX_ELEMENT:
            raise HTTPException(422, detail="One shape is too big (very long text or a large image)")
        target[op.id] = value
        applied.append({"k": op.k, "id": op.id, "v": value})
    applied += [{"k": "e", "id": i, "v": None} for i in _drop_loose_edges(content)]
    _check_size(content)
    d.content = content
    d.seq = (d.seq or 0) + 1
    d.updated_by = who["name"]
    d.updated_at = now()
    seq = d.seq
    db.add(DiagramOp(diagram_id=d.id, seq=seq, client_id=client_id, actor=who["name"], ops=applied, created_at=now()))
    if d.last_version_at is None or d.last_version_at <= now() - AUTO_VERSION_EVERY:
        db.add(DiagramVersion(diagram_id=d.id, content=copy.deepcopy(content), seq=seq, created_by=who["name"],
                              created_at=now()))
        d.last_version_at = now()
    _activity(db, d, "edited", who["name"], group=timedelta(hours=1))
    if seq % 200 == 0:
        db.query(DiagramOp).filter(DiagramOp.diagram_id == d.id, DiagramOp.seq <= seq - KEEP_OPS) \
            .delete(synchronize_session=False)
    db.commit()
    live.publish(d.id, {"k": "ops", "seq": seq, "client": client_id, "actor": who["name"], "ops": applied})
    return {"seq": seq, "ops": applied}


def catch_up(db: Session, diagram_id: int, since: int | None) -> dict:
    """What a tab that has seen up to `since` is missing: the changes, or the whole diagram again."""
    d = db.get(Diagram, diagram_id)
    if d is None:
        return {"gone": True}
    if since is not None and since == d.seq:
        return {"seq": d.seq, "batches": []}
    if since is not None and 0 <= since < d.seq:
        rows = (db.query(DiagramOp).filter(DiagramOp.diagram_id == d.id, DiagramOp.seq > since)
                .order_by(DiagramOp.seq).all())
        if rows and rows[0].seq == since + 1 and len(rows) == d.seq - since:
            return {"seq": d.seq, "batches": [{"seq": r.seq, "client": r.client_id, "actor": r.actor, "ops": r.ops}
                                              for r in rows]}
    return {"seq": d.seq, "reload": True, "content": d.content or EMPTY}


# List & detail -----------------------------------------------------------------------------------

def _visible(db: Session, ws: Customer):
    q = db.query(Diagram).filter(Diagram.workspace_id == root_id(ws))
    if role_of(ws) in ("owner", "admin"):
        return q
    person = actor(ws)
    mine = db.query(DiagramMember.diagram_id).filter(DiagramMember.member_id == person.id)
    return q.filter(or_(Diagram.team_access != "private", Diagram.created_by_id == person.id, Diagram.id.in_(mine)))


def list_diagrams(db: Session, ws: Customer, search: str | None = None, folder: str | None = None,
                  starred: bool = False) -> dict:
    q = _visible(db, ws)
    if search:
        q = q.filter(Diagram.name.ilike(f"%{search.strip()}%"))
    if folder:
        q = q.filter(Diagram.folder == folder)
    stars = {i for (i,) in db.query(DiagramStar.diagram_id).filter(DiagramStar.member_id == actor(ws).id)}
    if starred:
        q = q.filter(Diagram.id.in_(stars or {0}))
    rows = q.order_by(Diagram.updated_at.desc(), Diagram.id.desc()).limit(500).all()
    folders = sorted({f for (f,) in _visible(db, ws).with_entities(Diagram.folder).distinct() if f})
    data = []
    for d in rows:
        content = d.content or EMPTY
        data.append({
            "id": d.id, "name": d.name, "folder": d.folder, "level": _level(db, ws, d),
            "starred": d.id in stars, "team_access": d.team_access, "shared": bool(d.link_enabled),
            "shapes": len(content.get("nodes", {})), "created_by": d.created_by, "updated_by": d.updated_by,
            "created_at": iso(d.created_at), "updated_at": iso(d.updated_at), "preview": _preview(content),
        })
    return {"status": True, "data": data, "folders": folders}


def _link(d: Diagram) -> dict:
    return {"enabled": bool(d.link_enabled), "access": d.link_access, "token": d.share_token,
            "has_password": bool(d.link_password), "expires_at": iso(d.link_expires_at)}


def serialize(db: Session, ws: Customer, d: Diagram, level: str) -> dict:
    data = {
        "id": d.id, "name": d.name, "folder": d.folder, "content": d.content or EMPTY, "seq": d.seq or 0,
        "level": level, "team_access": d.team_access, "created_by": d.created_by, "updated_by": d.updated_by,
        "created_at": iso(d.created_at), "updated_at": iso(d.updated_at), "me": me(ws),
        "starred": db.query(DiagramStar.id).filter(DiagramStar.diagram_id == d.id,
                                                   DiagramStar.member_id == actor(ws).id).first() is not None,
    }
    if level == "manage":
        data["link"] = _link(d)
        data["members"] = [{"member_id": m.member_id, "role": m.role} for m in d.members]
    return data


def get_diagram(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, level = get(db, ws, diagram_id)
    _activity(db, d, "viewed", _name(ws), group=timedelta(hours=6))
    db.commit()
    return {"status": True, "data": serialize(db, ws, d, level)}


def create_diagram(db: Session, ws: Customer, payload: DiagramSchema) -> dict:
    content = _clean(payload.content)
    person = actor(ws)
    d = Diagram(workspace_id=root_id(ws), name=payload.name, folder=payload.folder, content=content, seq=0,
                created_by_id=person.id, created_by=_name(ws), updated_by=_name(ws))
    db.add(d)
    db.flush()
    _activity(db, d, "created", _name(ws))
    db.commit()
    return {"status": True, "message": "Diagram created", "data": serialize(db, ws, d, "manage")}


def update_diagram(db: Session, ws: Customer, diagram_id: int, payload: DiagramUpdateSchema) -> dict:
    d, level = get(db, ws, diagram_id, "edit")
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"]:
        d.name = fields["name"]
    if "folder" in fields:
        d.folder = fields["folder"] or None
    db.commit()
    live.publish(d.id, {"k": "meta", "name": d.name, "folder": d.folder})
    return {"status": True, "message": "Saved", "data": serialize(db, ws, d, level)}


def duplicate(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, _ = get(db, ws, diagram_id)
    copy_of = DiagramSchema(name=f"{d.name} (copy)"[:150], folder=d.folder, content=copy.deepcopy(d.content))
    result = create_diagram(db, ws, copy_of)
    result["message"] = "Copy made"
    return result


def delete_diagram(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, _ = get(db, ws, diagram_id, "manage")
    db.delete(d)
    db.commit()
    live.publish(diagram_id, {"k": "access"})  # open tabs find it gone
    return {"status": True, "message": "Diagram deleted", "data": None}


def star(db: Session, ws: Customer, diagram_id: int, on: bool) -> dict:
    d, _ = get(db, ws, diagram_id)
    person = actor(ws)
    q = db.query(DiagramStar).filter(DiagramStar.diagram_id == d.id, DiagramStar.member_id == person.id)
    if on and not q.first():
        db.add(DiagramStar(diagram_id=d.id, member_id=person.id))
    if not on:
        q.delete()
    db.commit()
    return {"status": True, "message": "Starred" if on else "Removed from starred", "data": {"starred": on}}


def save_ops(db: Session, ws: Customer, diagram_id: int, ops: list[Op], client_id: str | None) -> dict:
    get(db, ws, diagram_id, "edit")
    return {"status": True, "data": apply_ops(diagram_id, ws, ops, client_id, me(ws), db)}


def changes_since(db: Session, ws: Customer, diagram_id: int, since: int) -> dict:
    get(db, ws, diagram_id)
    return {"status": True, "data": catch_up(db, diagram_id, since)}


# Access & sharing --------------------------------------------------------------------------------

def team(db: Session, ws: Customer) -> list[dict]:
    """Everyone in the workspace (for the Share dialog)."""
    main_id = root_id(ws)
    people = (db.query(Customer).filter(or_(Customer.id == main_id, Customer.workspace_id == main_id),
                                        Customer.not_deleted(), Customer.status == Status.ACTIVE.value)
              .order_by(Customer.id).all())
    return [{"id": p.id, "name": p.name or p.email, "email": p.email,
             "role": "owner" if p.workspace_id is None else p.role, "color": color_of(p.id)} for p in people]


def set_access(db: Session, ws: Customer, diagram_id: int, payload: AccessSchema) -> dict:
    d, level = get(db, ws, diagram_id, "manage")
    allowed = {p["id"] for p in team(db, ws)}
    d.team_access = payload.team_access
    db.query(DiagramMember).filter(DiagramMember.diagram_id == d.id).delete()
    for m in payload.members:
        if m.member_id in allowed and m.member_id != d.created_by_id:
            db.add(DiagramMember(diagram_id=d.id, member_id=m.member_id, role=m.role))
    _activity(db, d, "shared", _name(ws), detail="Changed who in the team can open it")
    db.commit()
    db.refresh(d)
    live.publish(d.id, {"k": "access"})
    return {"status": True, "message": "Access saved", "data": serialize(db, ws, d, level)}


def set_link(db: Session, ws: Customer, diagram_id: int, payload: LinkSchema) -> dict:
    d, level = get(db, ws, diagram_id, "manage")
    if payload.enabled and (d.share_token is None or payload.new_link):
        d.share_token = secrets.token_urlsafe(24)
    d.link_enabled = payload.enabled
    d.link_access = payload.access
    if payload.password is not None:
        d.link_password = hash_password(payload.password) if payload.password.strip() else None
    expires = payload.expires_at
    if expires is not None and expires.tzinfo is not None:
        expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
    if expires is not None and expires <= now():
        raise field_error(422, "expires_at", "Pick a time in the future")
    d.link_expires_at = expires
    what = ("Turned the share link off" if not payload.enabled
            else f"Share link: anyone with it can {'view and comment' if payload.access == 'comment' else 'view'}")
    _activity(db, d, "shared", _name(ws), detail=what)
    db.commit()
    live.publish(d.id, {"k": "access"})  # guests whose link stopped working are let go
    message = "Link turned off" if not payload.enabled else "New link made" if payload.new_link else "Link saved"
    return {"status": True, "message": message, "data": serialize(db, ws, d, level)}


def activity(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, _ = get(db, ws, diagram_id)
    rows = (db.query(DiagramActivity).filter(DiagramActivity.diagram_id == d.id)
            .order_by(DiagramActivity.at.desc(), DiagramActivity.id.desc()).limit(100).all())
    return {"status": True, "data": [{"id": a.id, "kind": a.kind, "actor": a.actor, "guest": a.guest,
                                      "detail": a.detail, "at": iso(a.at)} for a in rows]}


# Versions ---------------------------------------------------------------------------------------

def list_versions(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, _ = get(db, ws, diagram_id)
    rows = (db.query(DiagramVersion).filter(DiagramVersion.diagram_id == d.id)
            .order_by(DiagramVersion.created_at.desc(), DiagramVersion.id.desc()).limit(100).all())
    return {"status": True, "data": [{"id": v.id, "name": v.name, "created_by": v.created_by,
                                      "created_at": iso(v.created_at), "shapes": len((v.content or {}).get("nodes", {}))}
                                     for v in rows]}


def get_version(db: Session, ws: Customer, diagram_id: int, version_id: int) -> dict:
    d, _ = get(db, ws, diagram_id)
    v = db.query(DiagramVersion).filter(DiagramVersion.id == version_id, DiagramVersion.diagram_id == d.id).first()
    if v is None:
        raise HTTPException(404, detail="Version not found")
    return {"status": True, "data": {"id": v.id, "name": v.name, "content": v.content, "created_at": iso(v.created_at),
                                     "created_by": v.created_by}}


def save_version(db: Session, ws: Customer, diagram_id: int, name: str) -> dict:
    d, _ = get(db, ws, diagram_id, "edit")
    db.add(DiagramVersion(diagram_id=d.id, name=name, content=copy.deepcopy(d.content or EMPTY), seq=d.seq,
                          created_by=_name(ws), created_at=now()))
    db.commit()
    return {"status": True, "message": "Version saved", "data": None}


def restore_version(db: Session, ws: Customer, diagram_id: int, version_id: int) -> dict:
    d, level = get(db, ws, diagram_id, "edit", lock=True)
    v = db.query(DiagramVersion).filter(DiagramVersion.id == version_id, DiagramVersion.diagram_id == d.id).first()
    if v is None:
        raise HTTPException(404, detail="Version not found")
    when = v.name or f"{v.created_at:%d %b, %H:%M}"
    db.add(DiagramVersion(diagram_id=d.id, name=f"Before restoring “{when}”"[:120],
                          content=copy.deepcopy(d.content or EMPTY), seq=d.seq, created_by=_name(ws), created_at=now()))
    d.content = _clean(copy.deepcopy(v.content))
    d.seq = (d.seq or 0) + 1  # tabs that ask for changes since an older number reload the whole diagram
    d.updated_by = _name(ws)
    _activity(db, d, "restored", _name(ws), detail=when)
    db.commit()
    live.publish(d.id, {"k": "reload"})
    return {"status": True, "message": "Version restored", "data": serialize(db, ws, d, level)}


# Comments ---------------------------------------------------------------------------------------

def _comment(c: DiagramComment) -> dict:
    return {"id": c.id, "parent_id": c.parent_id, "node_id": c.node_id, "x": c.x, "y": c.y, "body": c.body,
            "author": c.author_name, "author_id": c.author_id, "guest": c.guest,
            "color": color_of(c.author_id if c.author_id else f"guest:{c.author_name}"),
            "resolved": c.resolved_at is not None, "created_at": iso(c.created_at)}


def _comments(db: Session, d: Diagram) -> list[dict]:
    rows = (db.query(DiagramComment).filter(DiagramComment.diagram_id == d.id)
            .order_by(DiagramComment.created_at, DiagramComment.id).limit(1000).all())
    return [_comment(c) for c in rows]


def list_comments(db: Session, ws: Customer, diagram_id: int) -> dict:
    d, _ = get(db, ws, diagram_id)
    return {"status": True, "data": _comments(db, d)}


def _add_comment(db: Session, d: Diagram, payload: CommentSchema, author_id: int | None, name: str,
                 guest: bool) -> DiagramComment:
    parent = None
    if payload.parent_id is not None:
        parent = db.query(DiagramComment).filter(DiagramComment.id == payload.parent_id,
                                                 DiagramComment.diagram_id == d.id).first()
        if parent is None:
            raise field_error(422, "parent_id", "That comment was deleted")
        parent = db.get(DiagramComment, parent.parent_id) if parent.parent_id else parent
    elif payload.x is None and payload.node_id is None:
        raise field_error(422, "body", "Pin the comment somewhere on the diagram")
    c = DiagramComment(diagram_id=d.id, parent_id=parent.id if parent else None,
                       node_id=None if parent else payload.node_id, x=None if parent else payload.x,
                       y=None if parent else payload.y, body=payload.body, author_id=author_id,
                       author_name=name, guest=guest, created_at=now())
    db.add(c)
    if parent is not None and parent.resolved_at is not None:
        parent.resolved_at = None  # a reply opens the thread again
    _activity(db, d, "commented", name, guest=guest)
    db.flush()
    _tell(db, d, c, author_id)
    db.commit()
    live.publish(d.id, {"k": "comments"})
    return c


def _tell(db: Session, d: Diagram, c: DiagramComment, author_id: int | None) -> None:
    """Notifies whoever made the diagram and everyone in the thread (not the person who wrote it)."""
    from app.modules.customer.account import notify

    thread = c.parent_id or c.id
    ids = {d.created_by_id} | {i for (i,) in db.query(DiagramComment.author_id).filter(
        DiagramComment.diagram_id == d.id, DiagramComment.author_id.isnot(None),
        or_(DiagramComment.id == thread, DiagramComment.parent_id == thread))}
    ids.discard(None)
    ids.discard(author_id)
    people = db.query(Customer).filter(Customer.id.in_(ids or {0}), Customer.not_deleted(),
                                       Customer.status == Status.ACTIVE.value).all()
    title = f"{c.author_name}{' (guest)' if c.guest else ''} commented on “{d.name}”"
    notify.notify(db, people, "diagram_comment", title[:200], c.body[:300], f"/dashboard/diagrams/{d.id}?comment={thread}",
                  {"diagram_id": d.id, "comment_id": c.id})


def add_comment(db: Session, ws: Customer, diagram_id: int, payload: CommentSchema) -> dict:
    d, _ = get(db, ws, diagram_id, "comment")
    c = _add_comment(db, d, payload, actor(ws).id, _name(ws), False)
    return {"status": True, "message": "Comment added", "data": _comment(c)}


def resolve_comment(db: Session, ws: Customer, diagram_id: int, comment_id: int, resolved: bool) -> dict:
    d, _ = get(db, ws, diagram_id, "comment")
    c = db.query(DiagramComment).filter(DiagramComment.id == comment_id, DiagramComment.diagram_id == d.id,
                                        DiagramComment.parent_id.is_(None)).first()
    if c is None:
        raise HTTPException(404, detail="Comment not found")
    c.resolved_at = now() if resolved else None
    db.commit()
    live.publish(d.id, {"k": "comments"})
    return {"status": True, "message": "Resolved" if resolved else "Opened again", "data": _comment(c)}


def delete_comment(db: Session, ws: Customer, diagram_id: int, comment_id: int) -> dict:
    d, level = get(db, ws, diagram_id, "comment")
    c = db.query(DiagramComment).filter(DiagramComment.id == comment_id, DiagramComment.diagram_id == d.id).first()
    if c is None:
        raise HTTPException(404, detail="Comment not found")
    if c.author_id != actor(ws).id and level != "manage":
        raise HTTPException(403, detail="You can only delete your own comments")
    db.delete(c)
    db.commit()
    live.publish(d.id, {"k": "comments"})
    return {"status": True, "message": "Comment deleted", "data": None}


# Guests (the share link) ----------------------------------------------------------------------------

def _guest_pass(d: Diagram, expires: int) -> str:
    key = f"{d.share_token}:{d.link_password or ''}:{expires}".encode()
    sig = hmac.new(settings.SECRET_KEY.encode(), key, hashlib.sha256).hexdigest()[:32]
    return f"{expires}.{sig}"


def _pass_ok(d: Diagram, value: str | None) -> bool:
    try:
        expires, _ = (value or "").split(".", 1)
        return int(expires) > time.time() and hmac.compare_digest(value, _guest_pass(d, int(expires)))
    except ValueError:
        return False


def shared(db: Session, token: str, guest_pass: str | None = None, need: str = "view") -> Diagram:
    """The diagram behind a share link, if the link works (and the password was given)."""
    d = db.query(Diagram).filter(Diagram.share_token == token).first() if token else None
    if d is None or not d.link_enabled:
        raise HTTPException(404, detail="This link doesn't work any more. Ask for a new one.")
    if d.link_expires_at is not None and d.link_expires_at <= now():
        raise HTTPException(404, detail="This link has expired. Ask for a new one.")
    if d.link_password and not _pass_ok(d, guest_pass):
        raise HTTPException(401, detail="This diagram needs a password")
    if need == "comment" and d.link_access != "comment":
        raise HTTPException(403, detail="This link is view-only")
    return d


def unlock(db: Session, token: str, password: str) -> dict:
    d = db.query(Diagram).filter(Diagram.share_token == token).first() if token else None
    if d is None or not d.link_enabled or not d.link_password:
        shared(db, token)  # says why the link doesn't work
        return {"status": True, "data": {"pass": None}}
    if not verify_password(password, d.link_password):
        raise field_error(422, "password", "Wrong password")
    expires = int(time.time()) + GUEST_PASS_HOURS * 3600
    return {"status": True, "data": {"pass": _guest_pass(d, expires)}}


def guest_view(db: Session, token: str, guest_pass: str | None) -> dict:
    d = shared(db, token, guest_pass)
    _activity(db, d, "viewed", "Someone with the link", guest=True, group=timedelta(hours=1))
    db.commit()
    return {"status": True, "data": {
        "name": d.name, "content": d.content or EMPTY, "seq": d.seq or 0, "access": d.link_access,
        "updated_at": iso(d.updated_at), "comments": _comments(db, d) if d.link_access == "comment" else [],
    }}


def guest_changes(db: Session, token: str, guest_pass: str | None, since: int) -> dict:
    d = shared(db, token, guest_pass)
    return {"status": True, "data": catch_up(db, d.id, since)}


def guest_comments(db: Session, token: str, guest_pass: str | None) -> dict:
    d = shared(db, token, guest_pass, "comment")
    return {"status": True, "data": _comments(db, d)}


def guest_comment(db: Session, token: str, guest_pass: str | None, payload: GuestCommentSchema) -> dict:
    d = shared(db, token, guest_pass, "comment")
    c = _add_comment(db, d, payload, None, payload.name, True)
    return {"status": True, "message": "Comment added", "data": _comment(c)}
