from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.system_health import service
from app.shared.constants import permissions as P

router = APIRouter(prefix="/system-health", tags=["Admin System Health"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.SYSTEM_HEALTH_VIEW))])
def index(db: Session = Depends(get_db)):
    return service.checks(db)


@router.get("/summary", dependencies=[Depends(require_admin_permission(P.SYSTEM_HEALTH_VIEW))])
def summary(db: Session = Depends(get_db)):
    return service.summary(db)


@router.get("/sizes", dependencies=[Depends(require_admin_permission(P.SYSTEM_HEALTH_VIEW))])
def sizes(db: Session = Depends(get_db)):
    return service.sizes(db)


@router.post("/mail-check", dependencies=[Depends(require_admin_permission(P.SYSTEM_HEALTH_MANAGE))])
def mail_check(db: Session = Depends(get_db)):
    return service.mail_check(db)


@router.post("/clear-cache", dependencies=[Depends(require_admin_permission(P.SYSTEM_HEALTH_MANAGE))])
def clear_cache(request: Request):
    return service.clear_cache(request)
