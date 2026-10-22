from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rate_limiter import RateLimit
from app.modules.admin.email_templates import service
from app.modules.admin.email_templates.schemas import (
    EmailDesignSchema,
    TemplatePreviewSchema,
    TemplateUpdateSchema,
)
from app.shared.constants import permissions as P

router = APIRouter(prefix="/email-templates", tags=["Admin Email Templates"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def index(db: Session = Depends(get_db)):
    return service.list_templates(db)


@router.put("/design", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def update_design(payload: EmailDesignSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_design(db, payload, request)


@router.put("/{key}", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def update(key: str, payload: TemplateUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_template(db, key, payload, request, get_current_user(request))


@router.delete("/{key}", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def restore(key: str, request: Request, db: Session = Depends(get_db)):
    return service.restore_template(db, key, request)


@router.post("/{key}/preview", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def preview(key: str, request: Request, payload: TemplatePreviewSchema | None = None,
            db: Session = Depends(get_db)):
    overrides = payload.values.model_dump(exclude_none=True) if payload and payload.values else None
    return service.preview_template(db, key, overrides, get_current_user(request))


@router.post(
    "/{key}/test",
    dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE)), Depends(RateLimit(requests=6, window_seconds=60))],
)
def test(key: str, request: Request, payload: TemplatePreviewSchema | None = None, db: Session = Depends(get_db)):
    overrides = payload.values.model_dump(exclude_none=True) if payload and payload.values else None
    return service.send_test(db, key, overrides, get_current_user(request), request)
