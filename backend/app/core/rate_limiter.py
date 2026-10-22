import logging
import time

from fastapi import HTTPException, Request
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import engine
from app.shared.utils.request_meta import client_ip

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL = 300
_MAX_WINDOW = 3600

_history: dict[tuple[str, str], list[float]] = {}
_last_sweep = 0.0


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < _SWEEP_INTERVAL:
        return
    _last_sweep = now
    cutoff = now - _MAX_WINDOW
    for key in [k for k, v in _history.items() if not v or v[-1] <= cutoff]:
        _history.pop(key, None)


def _memory_hit(key: tuple[str, str], requests: int, window: int) -> int | None:
    now = time.time()
    _sweep(now)
    cutoff = now - window
    timestamps = [t for t in _history.get(key, []) if t > cutoff]
    if len(timestamps) >= requests:
        _history[key] = timestamps
        return int(window - (now - timestamps[0])) + 1
    timestamps.append(now)
    _history[key] = timestamps
    return None


_last_db_sweep = 0.0

_INCREMENT = text(
    "INSERT INTO rate_limit_hits (key, window_start, count, expires_at) "
    "VALUES (:key, :start, 1, :expires) "
    "ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_hits.count + 1 "
    "RETURNING count"
)
_PURGE = text("DELETE FROM rate_limit_hits WHERE expires_at < :now")


def purge_expired(conn=None) -> int:
    params = {"now": int(time.time())}
    if conn is not None:
        return conn.execute(_PURGE, params).rowcount
    with engine.begin() as own:
        return own.execute(_PURGE, params).rowcount


def _db_hit(key: tuple[str, str], requests: int, window: int) -> int | None:
    global _last_db_sweep
    now = time.time()
    start = int(now // window) * window
    with engine.begin() as conn:
        count = conn.execute(_INCREMENT, {
            "key": f"{key[0]}|{key[1]}|{window}"[:600], "start": start, "expires": start + window,
        }).scalar_one()
        if now - _last_db_sweep >= _SWEEP_INTERVAL:
            _last_db_sweep = now
            purge_expired(conn)
    if count > requests:
        return max(int(start + window - now), 0) + 1
    return None


def _hit(key: tuple[str, str], requests: int, window: int) -> int | None:
    if settings.RATE_LIMIT_BACKEND == "memory":
        return _memory_hit(key, requests, window)
    try:
        return _db_hit(key, requests, window)
    except Exception:
        logger.exception("Rate limiter database unavailable; using the in-memory limiter")
        return _memory_hit(key, requests, window)


async def _record_limited(ip: str | None, request: Request) -> None:
    try:
        from app.modules.admin.security.firewall import REASON_RATE_LIMITED, record_blocked

        await run_in_threadpool(record_blocked, ip, REASON_RATE_LIMITED, request)
    except Exception:
        logger.exception("Failed to record rate-limited request")


class RateLimit:
    def __init__(self, requests: int, window_seconds: int = 60):
        self.requests = requests
        self.window_seconds = window_seconds

    async def __call__(self, request: Request):
        ip = client_ip(request)
        key = (ip or "unknown", request.url.path)
        if settings.RATE_LIMIT_BACKEND == "memory":
            wait_time = _memory_hit(key, self.requests, self.window_seconds)
        else:
            wait_time = await run_in_threadpool(_hit, key, self.requests, self.window_seconds)

        if wait_time is not None:
            await _record_limited(ip, request)
            raise HTTPException(
                status_code=429,
                detail={
                    "message": f"Too many requests. Please try again in {wait_time} seconds.",
                    "errors": {"rate_limit": [f"Try again in {wait_time} seconds."]},
                },
            )
