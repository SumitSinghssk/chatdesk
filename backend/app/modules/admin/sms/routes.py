from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.admin.sms import service
from app.modules.admin.sms.schemas import SmsSettingsSchema, SmsTemplatesSchema, SmsTestSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/sms", tags=["Admin SMS"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def show(db: Session = Depends(get_db)):
    return service.show(db)


@router.put("/", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def update(payload: SmsSettingsSchema, request: Request, db: Session = Depends(get_db)):
    return service.update(db, payload, request)


@router.put("/templates", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def update_templates(payload: SmsTemplatesSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_templates(db, payload, request)


@router.post("/test", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE)), Depends(RateLimit(6, 60))])
def test(payload: SmsTestSchema, request: Request, db: Session = Depends(get_db)):
    return service.test(db, payload, request)


@router.get("/logs", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def logs(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Literal["sent", "failed", "skipped"] | None = None,
    db: Session = Depends(get_db),
):
    return service.logs(db, page, per_page, search, status)
