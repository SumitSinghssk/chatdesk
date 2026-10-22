from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.website.whatsapp import service

router = APIRouter(prefix="/whatsapp")


@router.get("/webhook/{webhook_key}", include_in_schema=False)
def verify(webhook_key: str, db: Session = Depends(get_db),
           mode: str | None = Query(None, alias="hub.mode"),
           token: str | None = Query(None, alias="hub.verify_token"),
           challenge: str | None = Query(None, alias="hub.challenge")):
    answer = service.verify(db, webhook_key, mode, token, challenge)
    if answer is None:
        return PlainTextResponse("Forbidden", status_code=403)
    return PlainTextResponse(answer)


@router.post("/webhook/{webhook_key}", include_in_schema=False)
async def receive(webhook_key: str, request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    code, message = service.receive(db, webhook_key, body, request.headers.get("x-hub-signature-256"))
    return JSONResponse(status_code=code, content={"status": code == 200, "message": message})
