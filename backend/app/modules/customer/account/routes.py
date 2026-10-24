from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer, require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account import data, security, service
from app.modules.customer.account.models import Customer
from app.modules.customer.account.schemas import (
    DeleteAccountSchema, EmailChangeSchema, EmailVerifySchema, GoogleLinkSchema, IdentitySchema,
    PasswordUpdateSchema, PhoneSendSchema, PhoneVerifySchema, ProfileUpdateSchema, ReadSchema, TwoFactorCodeSchema,
)
from app.modules.customer.account.settings import NotificationsUpdate, PreferencesUpdate

router = APIRouter(prefix="/account", tags=["Customer Account"])
_csrf = Depends(require_customer_csrf)


@router.get("/me")
def me(customer: Customer = Depends(require_customer)):
    return service.me(customer)


@router.put("/profile", dependencies=[_csrf])
def update_profile(payload: ProfileUpdateSchema, customer: Customer = Depends(require_customer),
                   db: Session = Depends(get_db)):
    return service.update_profile(db, customer, payload)


@router.put("/password", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def update_password(payload: PasswordUpdateSchema, request: Request, customer: Customer = Depends(require_customer),
                    db: Session = Depends(get_db)):
    return service.update_password(db, customer, payload, request)


@router.post("/phone/send", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def send_phone_code(payload: PhoneSendSchema, request: Request, customer: Customer = Depends(require_customer),
                    db: Session = Depends(get_db)):
    return service.send_phone_code(db, customer, payload, request)


@router.post("/phone/verify", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def verify_phone(payload: PhoneVerifySchema, customer: Customer = Depends(require_customer),
                 db: Session = Depends(get_db)):
    return service.verify_phone(db, customer, payload)


@router.get("/sessions")
def sessions(request: Request, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.sessions(db, customer, request)


@router.delete("/sessions/{session_id}", dependencies=[_csrf])
def revoke_session(session_id: int, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.revoke_session(db, customer, session_id)


@router.delete("/sessions", dependencies=[_csrf])
def sign_out_others(request: Request, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return security.sign_out_others(db, customer, request)


# Photo and email -------------------------------------------------------------------------------

@router.post("/avatar", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def upload_avatar(file: UploadFile = File(...), customer: Customer = Depends(require_customer),
                  db: Session = Depends(get_db)):
    return service.upload_avatar(db, customer, file)


@router.delete("/avatar", dependencies=[_csrf])
def delete_avatar(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.delete_avatar(db, customer)


@router.post("/email", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def change_email(payload: EmailChangeSchema, request: Request, customer: Customer = Depends(require_customer),
                 db: Session = Depends(get_db)):
    return service.send_email_code(db, customer, payload, request)


@router.post("/email/verify", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def verify_email(payload: EmailVerifySchema, customer: Customer = Depends(require_customer),
                 db: Session = Depends(get_db)):
    return service.verify_email_code(db, customer, payload)


@router.delete("/email", dependencies=[_csrf])
def cancel_email(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.cancel_email_change(db, customer)


# Security --------------------------------------------------------------------------------------

@router.get("/security")
def security_overview(customer: Customer = Depends(require_customer)):
    return {"status": True, "data": {"two_factor": security.two_factor_status(customer),
                                     "has_password": bool(customer.password),
                                     "google_linked": bool(customer.google_id),
                                     "phone_verified": bool(customer.phone_verified_at)}}


@router.post("/two-factor/setup", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def two_factor_setup(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return security.setup(db, customer)


@router.post("/two-factor/confirm", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def two_factor_confirm(payload: TwoFactorCodeSchema, customer: Customer = Depends(require_customer),
                       db: Session = Depends(get_db)):
    return security.confirm(db, customer, payload.code)


@router.post("/two-factor/recovery-codes", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def two_factor_codes(payload: IdentitySchema, customer: Customer = Depends(require_customer),
                     db: Session = Depends(get_db)):
    return security.new_recovery_codes(db, customer, payload.password, payload.code)


@router.post("/two-factor/disable", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def two_factor_disable(payload: IdentitySchema, customer: Customer = Depends(require_customer),
                       db: Session = Depends(get_db)):
    return security.disable(db, customer, payload.password, payload.code)


@router.get("/login-history")
def login_history(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return security.login_history(db, customer)


@router.post("/google", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def link_google(payload: GoogleLinkSchema, customer: Customer = Depends(require_customer),
                db: Session = Depends(get_db)):
    return security.link_google(db, customer, payload.credential)


@router.delete("/google", dependencies=[_csrf])
def unlink_google(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return security.unlink_google(db, customer)


# Preferences and notifications ----------------------------------------------------------------------

@router.get("/preferences")
def preferences(customer: Customer = Depends(require_customer)):
    return service.get_preferences(customer)


@router.put("/preferences", dependencies=[_csrf])
def save_preferences(payload: PreferencesUpdate, customer: Customer = Depends(require_customer),
                     db: Session = Depends(get_db)):
    return service.save_preferences(db, customer, payload)


@router.get("/notification-settings")
def notification_settings(customer: Customer = Depends(require_customer)):
    return service.get_notification_settings(customer)


@router.put("/notification-settings", dependencies=[_csrf])
def save_notification_settings(payload: NotificationsUpdate, customer: Customer = Depends(require_customer),
                               db: Session = Depends(get_db)):
    return service.save_notification_settings(db, customer, payload)


@router.get("/notifications")
def notifications(after: int | None = Query(None, ge=0), customer: Customer = Depends(require_customer),
                  db: Session = Depends(get_db)):
    return service.feed(db, customer, after)


@router.post("/notifications/read", dependencies=[_csrf])
def read_notifications(payload: ReadSchema, customer: Customer = Depends(require_customer),
                       db: Session = Depends(get_db)):
    return service.mark_read(db, customer, payload)


# Your data ----------------------------------------------------------------------------------------

@router.get("/export", dependencies=[Depends(RateLimit(3, 60))])
def export(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return data.export(db, customer)


@router.post("/delete", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def delete_account(payload: DeleteAccountSchema, request: Request, response: Response,
                   customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return data.delete_account(db, customer, payload, request, response)
