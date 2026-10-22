import hmac
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.admin.security import firewall
from app.modules.website.traffic import service

router = APIRouter()


class RedirectHitSchema(BaseModel):
    source_path: str = Field(..., max_length=500)


class NotFoundSchema(BaseModel):
    path: str = Field(..., min_length=1, max_length=2000)
    referrer: Optional[str] = Field(None, max_length=2000)
    user_agent: Optional[str] = Field(None, max_length=1000)


@router.get("/redirects")
def redirects(db: Session = Depends(get_db)):
    return service.active_redirects(db)


@router.post("/redirects/hit", dependencies=[Depends(RateLimit(requests=60, window_seconds=60))])
def redirect_hit(payload: RedirectHitSchema, db: Session = Depends(get_db)):
    return service.record_hit(db, payload.source_path)


@router.post("/not-found", dependencies=[Depends(RateLimit(requests=60, window_seconds=60))])
def not_found(payload: NotFoundSchema, db: Session = Depends(get_db)):
    return service.record_not_found(db, payload.path, payload.referrer, payload.user_agent)


def require_internal_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = settings.INTERNAL_API_KEY
    if not expected:
        return
    if not x_internal_key:
        raise HTTPException(status_code=401, detail="Missing internal API key")
    if not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid internal API key")


@router.get("/firewall", dependencies=[Depends(require_internal_key)])
def blocked_ips(db: Session = Depends(get_db)):
    return {"status": True, "data": firewall.active_rules(db)}
