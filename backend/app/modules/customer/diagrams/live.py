"""Live editing: who has a diagram open, their cursors, and every change, pushed to every open tab.

A change is saved first (service.apply_ops), then announced with Postgres NOTIFY. Every API process
(production runs several) LISTENs on one connection and passes what it hears to the browsers connected
to it, so two people on different processes still see each other. Messages carry only what is small;
a tab that missed something asks the database (service.catch_up), so nothing is lost if a message is.
"""

import asyncio
import json
import logging
import os
import select
import threading
import time
import uuid
from dataclasses import dataclass, field

from anyio import ClosedResourceError
from fastapi import WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.database import SessionLocal, engine

logger = logging.getLogger(__name__)

CHANNEL = "diagram_live"
MAX_PAYLOAD = 7000  # NOTIFY allows 8000 bytes; bigger change batches are fetched from the database
PRESENCE_GAP = 0.04  # seconds between one person's cursor updates (25 a second at most)
GONE = (WebSocketDisconnect, ClosedResourceError, RuntimeError)  # the tab closed or the connection dropped


@dataclass(eq=False)
class Peer:
    """One open tab."""

    id: str
    diagram_id: int
    info: dict  # {"id", "name", "color", "guest"}
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    seq: int = 0  # the last change this tab has been sent
    state: dict = field(default_factory=dict)  # its last cursor / selection, re-sent to people who join later

    def push(self, message: dict) -> None:
        self.loop.call_soon_threadsafe(self.queue.put_nowait, message)


_rooms: dict[int, set[Peer]] = {}
_rooms_lock = threading.Lock()
_listener: threading.Thread | None = None
_listening = threading.Event()  # set while the listener is subscribed
_publisher = None
_publish_lock = threading.Lock()


def _join(peer: Peer) -> None:
    with _rooms_lock:
        _rooms.setdefault(peer.diagram_id, set()).add(peer)


def _leave(peer: Peer) -> None:
    with _rooms_lock:
        room = _rooms.get(peer.diagram_id)
        if room is not None:
            room.discard(peer)
            if not room:
                _rooms.pop(peer.diagram_id, None)


def _local(diagram_id: int) -> list[Peer]:
    with _rooms_lock:
        return list(_rooms.get(diagram_id, ()))


# The bus ----------------------------------------------------------------------------------------

def _raw():
    """A plain driver connection of our own, outside the pool, in autocommit."""
    raw = engine.raw_connection()
    conn = raw.driver_connection
    raw.detach()
    conn.autocommit = True
    return conn


def publish(diagram_id: int, message: dict) -> None:
    """Tells every process (this one too) about something that happened in a diagram."""
    global _publisher
    body = json.dumps({"d": diagram_id, **message}, separators=(",", ":"), default=str)
    if len(body) > MAX_PAYLOAD:
        if message.get("k") != "ops":
            return  # only changes can be big, and those are in the database
        body = json.dumps({"d": diagram_id, "k": "ops", "seq": message["seq"], "client": message.get("client"),
                           "big": True})
    with _publish_lock:
        for attempt in (1, 2):
            try:
                if _publisher is None or _publisher.closed:
                    _publisher = _raw()
                with _publisher.cursor() as cur:
                    cur.execute("SELECT pg_notify(%s, %s)", (CHANNEL, body))
                return
            except Exception:  # noqa: BLE001 - a lost connection is opened again once
                try:
                    _publisher.close()
                except Exception:  # noqa: BLE001
                    pass
                _publisher = None
                if attempt == 2:
                    logger.exception("Couldn't announce a diagram change")


def _dispatch(payload: str) -> None:
    try:
        message = json.loads(payload)
    except ValueError:
        return
    diagram_id = message.pop("d", None)
    for peer in _local(diagram_id):
        peer.push(message)


def _listen() -> None:
    while True:
        conn = None
        try:
            conn = _raw()
            with conn.cursor() as cur:
                cur.execute(f"LISTEN {CHANNEL}")
            _listening.set()
            while True:
                if select.select([conn], [], [], 30) == ([], [], []):
                    with conn.cursor() as cur:  # keeps the connection alive through quiet times
                        cur.execute("SELECT 1")
                    continue
                conn.poll()
                while conn.notifies:
                    _dispatch(conn.notifies.pop(0).payload)
        except Exception:  # noqa: BLE001 - the database restarted or the network blinked: listen again
            logger.exception("Diagram listener stopped; starting again")
            time.sleep(2)
        finally:
            _listening.clear()
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass


def start_listener() -> None:
    global _listener
    if os.getenv("DIAGRAM_LIVE", "on").lower() in ("off", "0", "false"):
        return
    with _rooms_lock:
        if _listener is None or not _listener.is_alive():
            _listener = threading.Thread(target=_listen, name="diagram-listener", daemon=True)
            _listener.start()
    _listening.wait(5)  # so the first tab doesn't miss what happens right after it connects


# A connected tab --------------------------------------------------------------------------------

def _catch_up(diagram_id: int, since: int | None) -> dict:
    from app.modules.customer.diagrams import service

    db = SessionLocal()
    try:
        return service.catch_up(db, diagram_id, since)
    finally:
        db.close()


async def serve(websocket: WebSocket, diagram_id: int, info: dict, level: str, since: int | None,
                check, save_ops=None) -> None:
    """Runs one tab's connection. `check()` says (again) whether it may still be open, and at what level;
    `save_ops(ops, client_id)` saves changes (None: this tab can't edit)."""
    await websocket.accept()
    peer = Peer(id=uuid.uuid4().hex[:12], diagram_id=diagram_id, info=info, loop=asyncio.get_running_loop())
    await run_in_threadpool(start_listener)
    _join(peer)
    try:
        state = await run_in_threadpool(_catch_up, diagram_id, since)
        if state.get("gone"):
            await websocket.close(code=4404)
            return
        peer.seq = state["seq"]
        await websocket.send_json({"type": "hello", "peer": peer.id, "you": info, "level": level, **state})
        await run_in_threadpool(publish, diagram_id, {"k": "join", "from": peer.id, "peer": info})
        level_box = {"level": level}
        sender = asyncio.create_task(_send_loop(websocket, peer, check, level_box))
        receiver = asyncio.create_task(_receive_loop(websocket, peer, level_box, save_ops))
        done, pending = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            error = task.exception()
            if error is not None and not isinstance(error, GONE):
                logger.warning("Diagram connection ended: %r", error)
    except GONE:
        pass
    finally:
        _leave(peer)
        await run_in_threadpool(publish, diagram_id, {"k": "leave", "from": peer.id})
        try:
            await websocket.close()
        except RuntimeError:
            pass


async def _send_loop(websocket: WebSocket, peer: Peer, check, level_box: dict) -> None:
    while True:
        message = await peer.queue.get()
        kind = message.get("k")
        if kind == "ops":
            seq = message.get("seq", 0)
            if seq <= peer.seq:
                continue
            if seq == peer.seq + 1 and "ops" in message:
                await websocket.send_json({"type": "ops", "seq": seq, "client": message.get("client"),
                                           "actor": message.get("actor"), "ops": message["ops"]})
                peer.seq = seq
                continue
            state = await run_in_threadpool(_catch_up, peer.diagram_id, peer.seq)  # missed some, or a big one
            await _send_state(websocket, peer, state)
        elif kind in ("join", "presence", "leave"):
            if message.get("from") == peer.id:
                continue
            await websocket.send_json({"type": kind, "from": message["from"], "peer": message.get("peer"),
                                       **{k: message[k] for k in ("cursor", "selection", "drag", "view") if k in message}})
            if kind == "join":  # let the newcomer see who's already here
                await run_in_threadpool(publish, peer.diagram_id, {"k": "presence", "from": peer.id,
                                                                   "peer": peer.info, **peer.state})
        elif kind == "reload":
            state = await run_in_threadpool(_catch_up, peer.diagram_id, None)
            await _send_state(websocket, peer, state)
        elif kind == "access":
            level = await run_in_threadpool(check)
            if level is None:
                await websocket.send_json({"type": "closed", "message": "Your access to this diagram was removed."})
                await websocket.close(code=4403)
                return
            if level != level_box["level"]:
                level_box["level"] = level
                await websocket.send_json({"type": "level", "level": level})
        elif kind in ("comments", "meta", "state"):
            await websocket.send_json({"type": kind, **{k: v for k, v in message.items() if k != "k"}})


async def _send_state(websocket: WebSocket, peer: Peer, state: dict) -> None:
    if state.get("gone"):
        await websocket.send_json({"type": "closed", "message": "This diagram was deleted."})
        await websocket.close(code=4404)
        raise WebSocketDisconnect(4404)
    if state.get("reload"):
        await websocket.send_json({"type": "reload", "seq": state["seq"], "content": state["content"]})
    else:
        for batch in state["batches"]:
            await websocket.send_json({"type": "ops", **batch})
    peer.seq = state["seq"]


async def _receive_loop(websocket: WebSocket, peer: Peer, level_box: dict, save_ops) -> None:
    last_presence = 0.0
    while True:
        message = await websocket.receive_json()
        kind = message.get("type") if isinstance(message, dict) else None
        if kind == "ping":
            await websocket.send_json({"type": "pong"})
        elif kind == "presence":
            gap = time.monotonic() - last_presence
            if gap < PRESENCE_GAP:
                continue
            last_presence = time.monotonic()
            state = {k: message.get(k) for k in ("cursor", "selection", "drag", "view")}
            peer.state = {k: v for k, v in state.items() if k != "drag"}
            await run_in_threadpool(publish, peer.diagram_id, {"k": "presence", "from": peer.id, "peer": peer.info,
                                                               **state})
        elif kind == "ops":
            ref = message.get("ref")
            if save_ops is None or level_box["level"] not in ("edit", "manage"):
                await websocket.send_json({"type": "error", "ref": ref, "message": "You can't edit this diagram"})
                continue
            try:
                result = await run_in_threadpool(save_ops, message.get("ops") or [], message.get("client_id"))
            except Exception as exc:  # noqa: BLE001 - tell the tab, keep the connection
                detail = getattr(exc, "detail", None) or "Couldn't save that change"
                if not getattr(exc, "detail", None):
                    logger.exception("Saving diagram changes failed")
                await websocket.send_json({"type": "error", "ref": ref, "message": str(detail)})
                continue
            await websocket.send_json({"type": "ack", "ref": ref, "seq": result["seq"]})
