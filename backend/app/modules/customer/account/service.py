from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.customer.account.models import Customer, CustomerSession
from app.modules.customer.account.schemas import (
    PasswordUpdateSchema, PhoneSendSchema, PhoneVerifySchema, ProfileUpdateSchema,
)
from app.modules.customer.account.serializers import serialize_customer
from app.modules.customer.auth import otp
from app.modules.customer.auth.service import check_password, field_error, parse_phone
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import describe_agent


def _ok(customer: Customer, message: str | None = None) -> dict:
    body = {"status": True, "data": serialize_customer(customer)}
    return {**body, "message": message} if message else body


def me(customer: Customer) -> dict:
    return _ok(customer)


def update_profile(db: Session, customer: Customer, payload: ProfileUpdateSchema) -> dict:
    email = str(payload.email).lower() if payload.email else None
    if email and email != (customer.email or "").lower():
        raise field_error(422, "email", "Use “Change email”: we send a code to the new address first")
    if not email and customer.email:
        if not customer.phone and not customer.google_id:
            raise field_error(422, "email", "Keep an email or a mobile number on your account")
        customer.email, customer.email_verified_at = None, None
    customer.name = payload.name.strip()
    customer.job_title = payload.job_title
    if customer.workspace_id is None:  # team members don't own the business name
        customer.business_name = payload.business_name.strip() if payload.business_name else None
        db.query(Customer).filter(Customer.parent_id == customer.id).update(  # the other numbers too
            {Customer.business_name: customer.business_name}, synchronize_session=False)
    db.commit()
    return _ok(customer, "Profile saved")


def update_password(db: Session, customer: Customer, payload: PasswordUpdateSchema, request: Request) -> dict:
    if customer.password and not verify_password(payload.current_password or "", customer.password):
        raise field_error(422, "current_password", "Your current password isn't right")
    check_password(db, payload.password)
    customer.password = hash_password(payload.password)
    session = getattr(request.state, "customer_session", None)
    db.query(CustomerSession).filter(
        CustomerSession.customer_id == customer.id, CustomerSession.revoked_at.is_(None),
        CustomerSession.id != (session.id if session else 0),
    ).update({"revoked_at": now()})
    db.commit()
    return _ok(customer, "Password saved. Other devices have been signed out.")


def send_phone_code(db: Session, customer: Customer, payload: PhoneSendSchema, request: Request) -> dict:
    phone = parse_phone(db, payload.phone)
    if phone == customer.phone and customer.phone_verified_at:
        raise field_error(422, "phone", "This number is already verified on your account")
    if db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != customer.id,
                                    Customer.phone == phone).first():
        raise field_error(409, "phone", "Another account already uses this mobile number")
    data = otp.issue(db, phone, "phone", request, customer.id)
    return {"status": True, "message": "We've sent a code to your phone", "data": {**data, "phone": phone}}


def verify_phone(db: Session, customer: Customer, payload: PhoneVerifySchema) -> dict:
    phone = parse_phone(db, payload.phone)
    row = otp.verify(db, phone, payload.code, "phone")
    if row.customer_id != customer.id:
        db.commit()
        raise field_error(422, "code", "This code was sent for a different account")
    if db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != customer.id,
                                    Customer.phone == phone).first():
        db.commit()
        raise field_error(409, "phone", "Another account already uses this mobile number")
    customer.phone = phone
    customer.phone_verified_at = now()
    db.commit()
    return _ok(customer, "Mobile number verified")


def sessions(db: Session, customer: Customer, request: Request) -> dict:
    current = getattr(request.state, "customer_session", None)
    rows = (db.query(CustomerSession)
            .filter(CustomerSession.customer_id == customer.id, CustomerSession.revoked_at.is_(None),
                    CustomerSession.expires_at > now())
            .order_by(CustomerSession.last_active_at.desc()).limit(20).all())
    return {"status": True, "data": [
        {"id": r.id, "method": r.method, "ip_address": r.ip_address, **describe_agent(r.user_agent),
         "created_at": iso(r.created_at), "last_active_at": iso(r.last_active_at),
         "current": bool(current and current.id == r.id)}
        for r in rows
    ]}


def revoke_session(db: Session, customer: Customer, session_id: int) -> dict:
    row = db.query(CustomerSession).filter(CustomerSession.id == session_id,
                                           CustomerSession.customer_id == customer.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    row.revoked_at = row.revoked_at or now()
    db.commit()
    return {"status": True, "message": "Device signed out"}


# Photo -----------------------------------------------------------------------------------------------

def _own_upload(url: str | None) -> bool:
    return bool(url) and "/storage/uploads/avatars/" in url


def upload_avatar(db: Session, customer: Customer, file) -> dict:
    from app.shared.utils.uploads import delete_stored_file, save_upload

    saved = save_upload(file, folder="avatars")
    old = customer.avatar
    customer.avatar = saved["url"]
    db.commit()
    if _own_upload(old):
        delete_stored_file(old)
    return _ok(customer, "Photo updated")


def delete_avatar(db: Session, customer: Customer) -> dict:
    from app.shared.utils.uploads import delete_stored_file

    old, customer.avatar = customer.avatar, None
    db.commit()
    if _own_upload(old):
        delete_stored_file(old)
    return _ok(customer, "Photo removed")


# Email ------------------------------------------------------------------------------------------------

EMAIL_CODE_MINUTES = 15


def send_email_code(db: Session, customer: Customer, payload, request: Request) -> dict:
    import secrets
    from datetime import timedelta

    from app.core.config import settings
    from app.core.mailer import mail_enabled, send_mail
    from app.core.security import sha256

    email = str(payload.email).lower()
    if email == (customer.email or "").lower() and customer.email_verified_at:
        raise field_error(422, "email", "This is already your email")
    if customer.password and not verify_password(payload.password or "", customer.password):
        raise field_error(422, "password", "Your password isn't right")
    if db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != customer.id,
                                    func.lower(Customer.email) == email).first():
        raise field_error(409, "email", "Another account already uses this email")
    code = f"{secrets.randbelow(1_000_000):06d}"
    customer.pending_email = email
    customer.pending_email_code = sha256(f"{customer.id}:{email}:{code}")
    customer.pending_email_expires_at = now() + timedelta(minutes=EMAIL_CODE_MINUTES)
    customer.pending_email_attempts = 0
    db.commit()
    data = {"email": email, "expires_in": EMAIL_CODE_MINUTES * 60}
    if mail_enabled(db):
        send_mail(db, email, f"Your code: {code}", "Confirm your new email",
                  f"<p>Enter this code in ChatDesk to use this address for your account:</p>"
                  f"<p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>"
                  f"<p>It works for {EMAIL_CODE_MINUTES} minutes. If you didn't ask for this, ignore this email.</p>")
    elif not settings.is_production:
        data["dev_code"] = code  # no email server on this machine: shown so it can be tested
    else:
        raise HTTPException(status_code=503, detail="Email isn't set up on this server yet. Please contact us.")
    return {"status": True, "message": f"We've sent a code to {email}", "data": data}


def verify_email_code(db: Session, customer: Customer, payload) -> dict:
    import hmac

    from app.core.security import sha256

    email = customer.pending_email
    if not email or not customer.pending_email_expires_at or customer.pending_email_expires_at < now():
        raise field_error(422, "code", "This code has expired. Ask for a new one.")
    if customer.pending_email_attempts >= 5:
        raise field_error(429, "code", "Too many wrong codes. Ask for a new one.")
    if not hmac.compare_digest(customer.pending_email_code or "", sha256(f"{customer.id}:{email}:{payload.code}")):
        customer.pending_email_attempts += 1
        db.commit()
        raise field_error(422, "code", "That code isn't right")
    if db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != customer.id,
                                    func.lower(Customer.email) == email).first():
        raise field_error(409, "code", "Another account started using this email meanwhile")
    customer.email, customer.email_verified_at = email, now()
    customer.pending_email = customer.pending_email_code = customer.pending_email_expires_at = None
    customer.pending_email_attempts = 0
    db.commit()
    return _ok(customer, "Email changed and verified")


def cancel_email_change(db: Session, customer: Customer) -> dict:
    customer.pending_email = customer.pending_email_code = customer.pending_email_expires_at = None
    db.commit()
    return _ok(customer, "Email change cancelled")


# Preferences and notifications ------------------------------------------------------------------------

def get_preferences(customer: Customer) -> dict:
    from app.modules.customer.account.settings import preferences

    return {"status": True, "data": preferences(customer)}


def save_preferences(db: Session, customer: Customer, payload) -> dict:
    customer.preferences = payload.model_dump()
    db.commit()
    return {"status": True, "message": "Preferences saved", "data": customer.preferences}


def get_notification_settings(customer: Customer) -> dict:
    from app.modules.customer.account.settings import notification_settings

    return {"status": True, "data": notification_settings(customer)}


def save_notification_settings(db: Session, customer: Customer, payload) -> dict:
    from app.modules.customer.account.settings import EVENTS, is_manager, notification_settings

    allowed = {k for k, v in EVENTS.items() if is_manager(customer) or not v["managers"]}
    customer.notification_settings = {
        "events": {k: v.model_dump() for k, v in payload.events.items() if k in allowed},
        "waiting_minutes": payload.waiting_minutes,
    }
    db.commit()
    return {"status": True, "message": "Notification settings saved", "data": notification_settings(customer)}


def feed(db: Session, customer: Customer, after: int | None = None, limit: int = 30) -> dict:
    from app.modules.customer.account.models import CustomerNotification

    q = db.query(CustomerNotification).filter(CustomerNotification.customer_id == customer.id)
    unread = q.filter(CustomerNotification.read_at.is_(None)).count()
    rows = (q.filter(CustomerNotification.id > after) if after else q) \
        .order_by(CustomerNotification.id.desc()).limit(limit).all()
    return {"status": True, "data": {
        "unread": unread,
        "items": [{"id": n.id, "event": n.event, "title": n.title, "body": n.body, "url": n.url,
                   "browser": n.browser, "read": n.read_at is not None, "created_at": iso(n.created_at)}
                  for n in rows]}}


def mark_read(db: Session, customer: Customer, payload) -> dict:
    from app.modules.customer.account.models import CustomerNotification

    q = db.query(CustomerNotification).filter(CustomerNotification.customer_id == customer.id,
                                              CustomerNotification.read_at.is_(None))
    if not payload.all:
        q = q.filter(CustomerNotification.id.in_(payload.ids or [0]))
    count = q.update({CustomerNotification.read_at: now()}, synchronize_session=False)
    db.commit()
    return {"status": True, "data": {"marked": count}}
