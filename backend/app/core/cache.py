import atexit
import json
import logging
import os
import threading
import time
import urllib.request
from collections.abc import Callable, Iterable
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

ALL_TAGS = ("settings", "menus", "seo", "blogs", "comments", "pages", "galleries", "testimonials", "team",
            "sitemap", "redirects", "firewall")

TABLE_TAGS: dict[str, tuple[str, ...]] = {
    "settings": ("settings", "comments"),
    "menus": ("menus",),
    "menu_items": ("menus",),
    "seo_pages": ("seo",),
    "blogs": ("blogs", "sitemap"),
    "blog_categories": ("blogs",),
    "blog_comments": ("comments",),
    "users": ("blogs",),
    "pages": ("pages", "sitemap"),
    "galleries": ("galleries", "sitemap"),
    "gallery_items": ("galleries",),
    "testimonials": ("testimonials",),
    "team_members": ("team",),
    "redirects": ("redirects",),
    "ip_blocks": ("firewall",),
}

_PENDING_KEY = "sk_cache_tags"


class TTLCache:
    def __init__(self, ttl: float):
        self.ttl = ttl
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get_or_set(self, key, loader: Callable[[], Any]):
        now = time.monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit and hit[0] > now:
                return hit[1]
        value = loader()
        with self._lock:
            self._data[key] = (now + self.ttl, value)
        return value

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_local_caches: dict[str, list[TTLCache]] = {}


def local_cache(tag: str, ttl: float) -> TTLCache:
    cache = TTLCache(ttl)
    _local_caches.setdefault(tag, []).append(cache)
    return cache


def _clear_local(tags: Iterable[str]) -> None:
    for tag in tags:
        for cache in _local_caches.get(tag, []):
            cache.clear()


def _revalidate_url() -> str:
    explicit = os.getenv("WEBSITE_REVALIDATE_URL", "").strip()
    if explicit:
        return explicit
    base = (os.getenv("FRONTEND_INTERNAL_URL") or settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}/api/revalidate" if base else ""


def revalidation_enabled() -> bool:
    return (
        os.getenv("WEBSITE_REVALIDATE", "true").strip().lower() not in ("0", "false", "off")
        and bool(settings.INTERNAL_API_KEY)
        and bool(_revalidate_url())
    )


class _Dispatcher:
    def __init__(self, delay: float = 0.3):
        self.delay = delay
        self._tags: set[str] = set()
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None

    def push(self, tags: Iterable[str]) -> None:
        with self._lock:
            self._tags.update(tags)
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run, name="website-revalidate", daemon=True)
                self._thread.start()
        self._wake.set()

    def _run(self) -> None:
        while True:
            self._wake.wait()
            time.sleep(self.delay)
            with self._lock:
                tags, self._tags = self._tags, set()
                self._wake.clear()
            if tags:
                send_revalidate(sorted(tags))

    def flush(self, timeout: float = 5.0) -> None:
        with self._lock:
            tags, self._tags = self._tags, set()
        if tags:
            send_revalidate(sorted(tags), timeout=timeout)


_dispatcher = _Dispatcher()
atexit.register(lambda: _dispatcher.flush())


def revalidate_target() -> str:
    return _revalidate_url()


def send_revalidate(tags: list[str], timeout: float = 3.0) -> bool:
    if not revalidation_enabled():
        return False
    request = urllib.request.Request(
        _revalidate_url(),
        data=json.dumps({"tags": tags}).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Internal-Key": settings.INTERNAL_API_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            ok = 200 <= response.status < 300
        if not ok:
            logger.warning("Website revalidation returned HTTP %s for %s", response.status, tags)
        return ok
    except Exception as exc:  # noqa: BLE001
        logger.warning("Website revalidation failed for %s: %s", tags, exc)
        return False


def invalidate(*tags: str, wait: bool = False) -> bool:
    chosen = [t for t in tags if t in ALL_TAGS] or list(ALL_TAGS)
    _clear_local(chosen)
    if wait:
        return send_revalidate(chosen, timeout=5.0)
    if revalidation_enabled():
        _dispatcher.push(chosen)
    return True


def flush_pending() -> None:
    _dispatcher.flush()


def _collect(session: Session, tables: Iterable[str]) -> None:
    tags: set[str] = session.info.setdefault(_PENDING_KEY, set())
    for table in tables:
        tags.update(TABLE_TAGS.get(table, ()))


def _table_of(obj) -> str | None:
    table = getattr(type(obj), "__table__", None)
    return getattr(table, "name", None)


@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context, instances) -> None:
    changed = [*session.new, *session.deleted]
    changed += [obj for obj in session.dirty if session.is_modified(obj, include_collections=True)]
    _collect(session, filter(None, (_table_of(obj) for obj in changed)))


@event.listens_for(Session, "do_orm_execute")
def _bulk_statements(state) -> None:
    if not (state.is_update or state.is_delete):
        return
    mapper = state.bind_mapper
    table = getattr(getattr(mapper, "local_table", None), "name", None) if mapper is not None else None
    if table:
        _collect(state.session, [table])


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    tags = session.info.pop(_PENDING_KEY, None)
    if tags:
        invalidate(*sorted(tags))


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)
