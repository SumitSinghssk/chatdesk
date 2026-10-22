from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.payments import handle_webhook

router = APIRouter(prefix="/payments")


@router.post("/webhook/{gateway}", include_in_schema=False)
async def webhook(gateway: str, request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    code, message = handle_webhook(db, gateway, body, headers)
    return JSONResponse(status_code=code, content={"status": code == 200, "message": message})
