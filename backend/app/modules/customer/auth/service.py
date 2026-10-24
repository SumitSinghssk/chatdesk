from fastapi import HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.customer_auth import clear_session_cookies, current_session
from app.core.security import hash_password, verify_password
from app.modules.admin.settings.service import get_group
from app.modules.customer.account.models import Customer
from app.modules.customer.auth import otp
from app.modules.customer.auth.schemas import (
    GoogleLoginSchema, LoginSchema, OtpSendSchema, OtpVerifySchema, RegisterSchema,
)
from app.services.google_auth import GoogleAuthError, verify_id_token
from app.services.sms import normalize_phone, sms_available
from app.services.sms import config as sms_config
from app.shared.enums import Status
from app.shared.utils.datetime import now

_DUMMY_HASH = hash_password("not-a-real-password")
INVALID_LOGIN = "These details don't match an account"
SIGNUPS_CLOSED = "New sign-ups are closed right now"


def _cfg(db: Session) -> dict:
    return get_group(db, "customer_auth")


def field_error(status: int, field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"message": message, "errors": {field: [message]}})


def _method_off(name: str) -> HTTPException:
    return HTTPException(status_code=403, detail=f"Signing in with {name} is turned off")


def parse_phone(db: Session, raw: str, field: str = "phone") -> str:
    phone = normalize_phone(raw, sms_config.load(db)["default_country_code"])
    if not phone:
        raise field_error(422, field, "Enter a valid mobile number")
    return phone


def _active(customer: Customer) -> Customer:
    if customer.status != Status.ACTIVE.value:
        raise HTTPException(status_code=403, detail="Your account isn't active. Please contact us.")
    return customer


def _by(db: Session, *filters) -> Customer | None:
    return db.query(Customer).filter(Customer.not_deleted(), *filters).first()


def _signed_in(db: Session, customer: Customer, request: Request, response: Response, method: str,
               message: str = "Signed in") -> dict:
    """A session, or a request for the two-step code (account/security.py) when that's turned on."""
    from app.modules.customer.account import security

    return security.signed_in(db, _active(customer), request, response, method, message)


def options(db: Session) -> dict:
    cfg = _cfg(db)
    otp_on = bool(cfg["otp_enabled"])
    return {
        "status": True,
        "data": {
            "password": bool(cfg["password_enabled"]),
            "otp": otp_on,
            "google": bool(cfg["google_enabled"] and cfg["google_client_id"]),
            "registration": bool(cfg["allow_registration"]),
            "google_client_id": cfg["google_client_id"] if cfg["google_enabled"] else None,
            "otp_length": int(cfg["otp_length"]),
            "otp_resend_seconds": int(cfg["otp_resend_seconds"]),
            "default_country_code": sms_config.load(db)["default_country_code"],
            "sms_ready": otp_on and sms_available(db),
            "phone_verification": sms_available(db) or not settings.is_production,
        },
    }


def min_password_length(db: Session) -> int:
    return int(get_group(db, "security").get("password_min_length", 8))


def check_password(db: Session, password: str, field: str = "password") -> None:
    length = min_password_length(db)
    if len(password) < length:
        raise field_error(422, field, f"Password must be at least {length} characters")


def register(db: Session, payload: RegisterSchema, request: Request, response: Response) -> dict:
    cfg = _cfg(db)
    if not cfg["password_enabled"]:
        raise _method_off("a password")
    if not cfg["allow_registration"]:
        raise HTTPException(status_code=403, detail=SIGNUPS_CLOSED)
    check_password(db, payload.password)
    email = str(payload.email).lower()
    if _by(db, func.lower(Customer.email) == email):
        raise field_error(409, "email", "An account with this email already exists. Sign in instead.")
    phone = parse_phone(db, payload.phone) if payload.phone else None
    if phone and _by(db, Customer.phone == phone):
        raise field_error(409, "phone", "An account with this mobile number already exists.")
    customer = Customer(name=payload.name.strip(), business_name=payload.business_name, email=email, phone=phone,
                        password=hash_password(payload.password),
                        signup_method="password", status=Status.ACTIVE.value)
    db.add(customer)
    db.flush()
    return _signed_in(db, customer, request, response, "password", "Your account is ready")


def login(db: Session, payload: LoginSchema, request: Request, response: Response) -> dict:
    if not _cfg(db)["password_enabled"]:
        raise _method_off("a password")
    value = payload.login.strip()
    if "@" in value:
        customer = _by(db, func.lower(Customer.email) == value.lower())
    else:
        phone = normalize_phone(value, sms_config.load(db)["default_country_code"])
        customer = _by(db, Customer.phone == phone) if phone else None
    if customer is None or not customer.password:
        verify_password(payload.password, _DUMMY_HASH)
        raise field_error(401, "login", INVALID_LOGIN)
    if not verify_password(payload.password, customer.password):
        from app.modules.customer.account.security import record

        record(db, customer.id, "password", False, request, "wrong password")
        db.commit()
        raise field_error(401, "login", INVALID_LOGIN)
    return _signed_in(db, customer, request, response, "password")


def send_login_otp(db: Session, payload: OtpSendSchema, request: Request) -> dict:
    cfg = _cfg(db)
    if not cfg["otp_enabled"]:
        raise _method_off("a one-time code")
    phone = parse_phone(db, payload.phone)
    customer = _by(db, Customer.phone == phone)
    if customer is None and not cfg["allow_registration"]:
        raise field_error(404, "phone", "There's no account with this mobile number")
    if customer is not None:
        _active(customer)
    data = otp.issue(db, phone, "login", request, customer.id if customer else None)
    return {"status": True, "message": "We've sent a code to your phone",
            "data": {**data, "phone": phone, "is_new": customer is None}}


def verify_login_otp(db: Session, payload: OtpVerifySchema, request: Request, response: Response) -> dict:
    cfg = _cfg(db)
    if not cfg["otp_enabled"]:
        raise _method_off("a one-time code")
    phone = parse_phone(db, payload.phone)
    otp.verify(db, phone, payload.code, "login")
    customer = _by(db, Customer.phone == phone)
    if customer is None:
        if not cfg["allow_registration"]:
            db.commit()
            raise HTTPException(status_code=403, detail=SIGNUPS_CLOSED)
        customer = Customer(name=payload.name, phone=phone, signup_method="otp", status=Status.ACTIVE.value)
        db.add(customer)
        db.flush()
    elif payload.name and not customer.name:
        customer.name = payload.name
    customer.phone_verified_at = customer.phone_verified_at or now()
    return _signed_in(db, customer, request, response, "otp")


def google_login(db: Session, payload: GoogleLoginSchema, request: Request, response: Response) -> dict:
    cfg = _cfg(db)
    if not cfg["google_enabled"] or not cfg["google_client_id"]:
        raise _method_off("Google")
    try:
        profile = verify_id_token(payload.credential, cfg["google_client_id"])
    except GoogleAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    customer = _by(db, Customer.google_id == profile.sub)
    if customer is None and profile.email and profile.email_verified:
        customer = _by(db, func.lower(Customer.email) == profile.email)
        if customer is not None:
            customer.google_id = profile.sub
    if customer is None:
        if not cfg["allow_registration"]:
            raise HTTPException(status_code=403, detail=SIGNUPS_CLOSED)
        customer = Customer(name=profile.name, email=profile.email if profile.email_verified else None,
                            google_id=profile.sub, avatar=profile.picture, signup_method="google",
                            status=Status.ACTIVE.value)
        db.add(customer)
        db.flush()
    if profile.email_verified and customer.email == profile.email:
        customer.email_verified_at = customer.email_verified_at or now()
    if not customer.avatar and profile.picture:
        customer.avatar = profile.picture
    if not customer.name and profile.name:
        customer.name = profile.name
    return _signed_in(db, customer, request, response, "google")


def logout(db: Session, request: Request, response: Response) -> dict:
    session = current_session(db, request)
    if session is not None and session.revoked_at is None:
        session.revoked_at = now()
        db.commit()
    clear_session_cookies(response)
    return {"status": True, "message": "Signed out"}
