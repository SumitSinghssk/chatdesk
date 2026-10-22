from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.mailer import send_mail
from app.core.rate_limiter import RateLimit
from app.modules.admin.settings import service
from app.modules.admin.settings.schemas import MailTestSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/settings", tags=["Admin Settings"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def index(db: Session = Depends(get_db)):
    return service.get_all(db)


@router.post(
    "/mail/test",
    dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE)), Depends(RateLimit(6, 60))],
)
def mail_test(payload: MailTestSchema, db: Session = Depends(get_db)):
    send_mail(
        db,
        str(payload.to),
        "Test email",
        "Your email settings work",
        "<p>This is a test message sent from the admin panel. If you can read it, SMTP is configured correctly.</p>",
        raise_errors=True,
    )
    return {"status": True, "message": f"Test email sent to {payload.to}"}


@router.get("/{key}", dependencies=[Depends(require_admin_permission(P.SETTINGS_VIEW))])
def show(key: str, db: Session = Depends(get_db)):
    return service.show(db, key)


@router.put("/{key}", dependencies=[Depends(require_admin_permission(P.SETTINGS_UPDATE))])
def update(key: str, request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    return service.update_group(db, key, payload, request)
