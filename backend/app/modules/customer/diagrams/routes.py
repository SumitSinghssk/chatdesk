from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, WebSocket
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.customer_auth import require_customer, require_customer_csrf
from app.core.database import SessionLocal, get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.diagrams import live, service
from app.modules.customer.diagrams.schemas import (AccessSchema, ChangeRequestSchema, CommentSchema, DiagramSchema,
                                                   DiagramUpdateSchema, GuestCommentSchema, LinkSchema, Op, OpsSchema,
                                                   ResolveSchema, TimerSchema, UnlockSchema, VersionSchema, VoteSchema,
                                                   VotingSchema)
from app.modules.customer.team.access import require_workspace

router = APIRouter(prefix="/diagrams", tags=["Customer Diagrams"])
# people outside the workspace, through a share link (view or comment, never edit)
public_router = APIRouter(prefix="/shared-diagrams", tags=["Shared Diagrams"])
_csrf = Depends(require_customer_csrf)
PASS = "X-Diagram-Pass"


@router.get("")
def index(search: str | None = None, folder: str | None = None, starred: bool = False,
          ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_diagrams(db, ws, search, folder, starred)


@router.post("", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def create(payload: DiagramSchema, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.create_diagram(db, ws, payload)


@router.get("/team")
def team(ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return {"status": True, "data": service.team(db, ws)}


@router.get("/{diagram_id}")
def show(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_diagram(db, ws, diagram_id)


@router.put("/{diagram_id}", dependencies=[_csrf])
def update(diagram_id: int, payload: DiagramUpdateSchema, ws: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.update_diagram(db, ws, diagram_id, payload)


@router.delete("/{diagram_id}", dependencies=[_csrf])
def delete(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.delete_diagram(db, ws, diagram_id)


@router.post("/{diagram_id}/duplicate", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def duplicate(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.duplicate(db, ws, diagram_id)


@router.post("/{diagram_id}/star", dependencies=[_csrf])
def star(diagram_id: int, on: bool = True, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.star(db, ws, diagram_id, on)


# changes, for tabs that can't keep a live connection open
@router.post("/{diagram_id}/ops", dependencies=[Depends(RateLimit(600, 60)), _csrf])
def save_ops(diagram_id: int, payload: OpsSchema, ws: Customer = Depends(require_workspace),
             db: Session = Depends(get_db)):
    return service.save_ops(db, ws, diagram_id, payload.ops, payload.client_id)


@router.get("/{diagram_id}/ops")
def changes(diagram_id: int, since: int = Query(..., ge=0), ws: Customer = Depends(require_workspace),
            db: Session = Depends(get_db)):
    return service.changes_since(db, ws, diagram_id, since)


@router.post("/{diagram_id}/images", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def upload_image(diagram_id: int, file: UploadFile = File(...), ws: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return service.upload_image(db, ws, diagram_id, file)


@router.post("/{diagram_id}/timer", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def timer(diagram_id: int, payload: TimerSchema, ws: Customer = Depends(require_workspace),
          db: Session = Depends(get_db)):
    return service.set_timer(db, ws, diagram_id, payload.minutes)


@router.put("/{diagram_id}/voting", dependencies=[_csrf])
def voting(diagram_id: int, payload: VotingSchema, ws: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.set_voting(db, ws, diagram_id, payload.open, payload.per_person, payload.reset)


@router.post("/{diagram_id}/votes", dependencies=[Depends(RateLimit(120, 60)), _csrf])
def vote(diagram_id: int, payload: VoteSchema, ws: Customer = Depends(require_workspace),
         db: Session = Depends(get_db)):
    return service.vote(db, ws, diagram_id, payload.node_id, payload.on)


@router.post("/{diagram_id}/approve", dependencies=[_csrf])
def approve(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.approve(db, ws, diagram_id)


@router.post("/{diagram_id}/unlock", dependencies=[_csrf])
def unlock_changes(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.unlock_changes(db, ws, diagram_id)


@router.post("/{diagram_id}/request-change", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def request_change(diagram_id: int, payload: ChangeRequestSchema, ws: Customer = Depends(require_workspace),
                   db: Session = Depends(get_db)):
    return service.request_change(db, ws, diagram_id, payload.note)


@router.get("/{diagram_id}/since-approval")
def since_approval(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.since_approval(db, ws, diagram_id)


@router.put("/{diagram_id}/access", dependencies=[_csrf])
def access(diagram_id: int, payload: AccessSchema, ws: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.set_access(db, ws, diagram_id, payload)


@router.put("/{diagram_id}/link", dependencies=[_csrf])
def link(diagram_id: int, payload: LinkSchema, ws: Customer = Depends(require_workspace),
         db: Session = Depends(get_db)):
    return service.set_link(db, ws, diagram_id, payload)


@router.get("/{diagram_id}/activity")
def activity(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.activity(db, ws, diagram_id)


@router.get("/{diagram_id}/versions")
def versions(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_versions(db, ws, diagram_id)


@router.post("/{diagram_id}/versions", dependencies=[_csrf])
def save_version(diagram_id: int, payload: VersionSchema, ws: Customer = Depends(require_workspace),
                 db: Session = Depends(get_db)):
    return service.save_version(db, ws, diagram_id, payload.name)


@router.get("/{diagram_id}/versions/{version_id}")
def version(diagram_id: int, version_id: int, ws: Customer = Depends(require_workspace),
            db: Session = Depends(get_db)):
    return service.get_version(db, ws, diagram_id, version_id)


@router.post("/{diagram_id}/versions/{version_id}/restore", dependencies=[_csrf])
def restore(diagram_id: int, version_id: int, ws: Customer = Depends(require_workspace),
            db: Session = Depends(get_db)):
    return service.restore_version(db, ws, diagram_id, version_id)


@router.get("/{diagram_id}/comments")
def comments(diagram_id: int, ws: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_comments(db, ws, diagram_id)


@router.post("/{diagram_id}/comments", dependencies=[Depends(RateLimit(60, 60)), _csrf])
def comment(diagram_id: int, payload: CommentSchema, ws: Customer = Depends(require_workspace),
            db: Session = Depends(get_db)):
    return service.add_comment(db, ws, diagram_id, payload)


@router.put("/{diagram_id}/comments/{comment_id}", dependencies=[_csrf])
def resolve(diagram_id: int, comment_id: int, payload: ResolveSchema, ws: Customer = Depends(require_workspace),
            db: Session = Depends(get_db)):
    return service.resolve_comment(db, ws, diagram_id, comment_id, payload.resolved)


@router.delete("/{diagram_id}/comments/{comment_id}", dependencies=[_csrf])
def delete_comment(diagram_id: int, comment_id: int, ws: Customer = Depends(require_workspace),
                   db: Session = Depends(get_db)):
    return service.delete_comment(db, ws, diagram_id, comment_id)


# Live connections ---------------------------------------------------------------------------------

def _same_site(websocket: WebSocket) -> bool:
    """Browsers always send Origin on a WebSocket; it must be this site (a WebSocket has no CSRF header)."""
    origin = websocket.headers.get("origin")
    if not origin:
        return True  # not a browser
    host = urlparse(origin).netloc
    ours = {urlparse(u).netloc for u in (settings.FRONTEND_URL, settings.APP_URL) if u}
    ours |= {h for h in (websocket.headers.get("x-forwarded-host"), websocket.headers.get("host")) if h}
    return host in ours


@router.websocket("/{diagram_id}/live")
async def live_member(websocket: WebSocket, diagram_id: int, since: int | None = None):
    if not _same_site(websocket):
        await websocket.close(code=4403)
        return
    db = SessionLocal()
    try:
        ws = require_workspace(websocket, require_customer(websocket, db), db)
        _, level = service.get(db, ws, diagram_id)
        info, ws_id, person_id = service.me(ws), ws.id, ws.actor.id
    except HTTPException as exc:
        await websocket.close(code=4401 if exc.status_code == 401 else 4404)
        return
    finally:
        db.close()

    def _fresh():
        """The person's workspace again, in a new session (each call runs on a worker thread)."""
        session = SessionLocal()
        owner = session.get(Customer, ws_id)
        owner.actor = session.get(Customer, person_id)
        owner.member_role = "owner" if owner.actor.workspace_id is None else owner.actor.role
        return session, owner

    def check():
        session, owner = _fresh()
        try:
            return service.get(session, owner, diagram_id)[1]
        except HTTPException:
            return None
        finally:
            session.close()

    def save(ops, client_id):
        session, owner = _fresh()
        try:
            service.get(session, owner, diagram_id, "edit")
            return service.apply_ops(diagram_id, owner, [Op(**o) for o in ops][:1000], client_id, info, session)
        finally:
            session.close()

    await live.serve(websocket, diagram_id, info, level, since, check, save)


@public_router.websocket("/{token}/live")
async def live_guest(websocket: WebSocket, token: str, since: int | None = None, key: str | None = None,
                     name: str | None = None):
    if not _same_site(websocket):
        await websocket.close(code=4403)
        return
    db = SessionLocal()
    try:
        d = service.shared(db, token, key)
        diagram_id, access = d.id, d.link_access
    except HTTPException:
        await websocket.close(code=4404)
        return
    finally:
        db.close()
    label = (name or "").strip()[:60] or "Guest"
    info = {"id": None, "name": label, "color": service.color_of(f"guest:{label}"), "guest": True}

    def check():
        session = SessionLocal()
        try:
            return service.shared(session, token, key).link_access
        except HTTPException:
            return None
        finally:
            session.close()

    await live.serve(websocket, diagram_id, info, access, since, check, None)


# Guests -----------------------------------------------------------------------------------------------

@public_router.post("/{token}/unlock", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def unlock(token: str, payload: UnlockSchema, db: Session = Depends(get_db)):
    return service.unlock(db, token, payload.password)


@public_router.get("/{token}", dependencies=[Depends(RateLimit(120, 60))])
def guest_view(token: str, key: str | None = Header(None, alias=PASS), db: Session = Depends(get_db)):
    return service.guest_view(db, token, key)


@public_router.get("/{token}/ops", dependencies=[Depends(RateLimit(240, 60))])
def guest_changes(token: str, since: int = Query(..., ge=0), key: str | None = Header(None, alias=PASS),
                  db: Session = Depends(get_db)):
    return service.guest_changes(db, token, key, since)


@public_router.get("/{token}/comments", dependencies=[Depends(RateLimit(120, 60))])
def guest_comments(token: str, key: str | None = Header(None, alias=PASS), db: Session = Depends(get_db)):
    return service.guest_comments(db, token, key)


@public_router.post("/{token}/comments", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def guest_comment(token: str, payload: GuestCommentSchema, key: str | None = Header(None, alias=PASS),
                  db: Session = Depends(get_db)):
    return service.guest_comment(db, token, key, payload)
