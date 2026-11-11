"""Callbacks from the business's calling provider (Exotel StatusCallback and Passthru applets).

Nothing in a callback is trusted: it only says "look at call X". The call is read back from the provider
with the business's own credentials, after the response is sent (Exotel waits at most 15 seconds).
"""
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.calls import service

router = APIRouter(prefix="/calls")
logger = logging.getLogger(__name__)
MAX_BODY = 64 * 1024


async def _params(request: Request) -> dict:
    params: dict = dict(request.query_params)
    if request.method != "POST":
        return params
    body = await request.body()
    if len(body) > MAX_BODY:
        return params
    ctype = request.headers.get("content-type", "")
    if "json" in ctype:
        try:
            data = json.loads(body or b"{}")
        except ValueError:
            data = {}
        if isinstance(data, dict):
            params.update(data)
    elif "form" in ctype:
        form = await request.form()
        params.update({k: v for k, v in form.items() if isinstance(v, str)})
    return params


def _refresh(call_id: int, params: dict) -> None:
    db = SessionLocal()
    try:
        log = db.get(service.CallLog, call_id)
        if log is not None:
            service.refresh(db, log, params)
    except Exception:  # the scheduler retries; never crash the worker
        logger.exception("Call %s: processing the callback failed", call_id)
        db.rollback()
    finally:
        db.close()


@router.api_route("/webhook/{webhook_key}", methods=["GET", "POST"], include_in_schema=False,
                  dependencies=[Depends(RateLimit(120, 60))])
async def receive(webhook_key: str, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    params = await _params(request)
    code, message, call_id = service.receive(db, webhook_key, params)
    if call_id is not None:
        background.add_task(_refresh, call_id, params)
    return JSONResponse(status_code=code, content={"status": code == 200, "message": message})
