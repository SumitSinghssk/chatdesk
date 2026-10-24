"""Signing in safely: two-step sign-in (authenticator app + recovery codes), login history, signing out
other devices, and connecting Google."""

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.customer_auth import start_session
from app.core.security import CUSTOMER_TWO_FACTOR, create_customer_two_factor_token, decode_token, verify_password
from app.modules.admin.auth import two_factor as totp
from app.modules.customer.account.models import Customer, CustomerLoginEvent, CustomerSession
from app.modules.customer.account.serializers import serialize_customer
from app.modules.customer.auth.service import field_error
from app.shared.enums import Status
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import client_ip, describe_agent, user_agent

ISSUER = "ChatDesk"
METHODS = {"password": "Password", "otp": "Mobile code", "google": "Google", "invite": "Invitation",
           "two_factor": "Two-step code"}


def record(db: Session, customer_id: int | None, method: str, success: bool, request: Request,
           reason: str | None = None) -> None:
    db.add(CustomerLoginEvent(customer_id=customer_id, method=method, success=success, reason=reason,
                              ip_address=client_ip(request), user_agent=user_agent(request), created_at=now()))


# Signing in with a second step --------------------------------------------------------------------

def signed_in(db: Session, customer: Customer, request: Request, response: Response, method: str,
              message: str = "Signed in") -> dict:
    """The end of every sign-in: a session, or (with two-step on) a short-lived token for the code."""
    if customer.two_factor_enabled:
        record(db, customer.id, method, True, request, "waiting for the two-step code")
        db.commit()
        return {"status": True, "message": "Enter the code from your authenticator app",
                "data": {"two_factor_required": True,
                         "two_factor_token": create_customer_two_factor_token(customer.id, method)}}
    start_session(db, customer, request, response, method)
    record(db, customer.id, method, True, request)
    db.commit()
    return {"status": True, "message": message, "data": {"customer": serialize_customer(customer)}}


def challenge(db: Session, token: str, code: str | None, recovery_code: str | None, request: Request,
              response: Response) -> dict:
    payload = decode_token(token, CUSTOMER_TWO_FACTOR)
    customer = db.get(Customer, int(payload["sub"])) if payload else None
    if customer is None or customer.deleted_at is not None or not customer.two_factor_enabled:
        raise HTTPException(status_code=401, detail="This sign-in has expired. Please sign in again.")
    if customer.status != Status.ACTIVE.value:
        raise HTTPException(status_code=403, detail="Your account isn't active. Please contact us.")
    if recovery_code:
        left = totp.consume_recovery_code(customer.two_factor_recovery_codes, recovery_code)
        if left is None:
            record(db, customer.id, "two_factor", False, request, "wrong recovery code")
            db.commit()
            raise field_error(422, "recovery_code", "That recovery code isn't right, or it was already used")
        customer.two_factor_recovery_codes = left
    else:
        step = totp.verify_code(customer.two_factor_secret, code, customer.two_factor_last_step)
        if step is None:
            record(db, customer.id, "two_factor", False, request, "wrong two-step code")
            db.commit()
            raise field_error(422, "code", "That code isn't right. Check your app and try again.")
        customer.two_factor_last_step = step
    method = payload.get("method") or "password"
    start_session(db, customer, request, response, method)
    record(db, customer.id, "two_factor", True, request, "recovery code" if recovery_code else None)
    db.commit()
    data = {"customer": serialize_customer(customer)}
    if recovery_code:
        data["recovery_left"] = len(customer.two_factor_recovery_codes or [])
    return {"status": True, "message": "Signed in", "data": data}


# Setting it up ------------------------------------------------------------------------------------

def _person(ws: Customer) -> Customer:
    return getattr(ws, "actor", ws)


def confirm_identity(person: Customer, password: str | None, code: str | None) -> None:
    """Sensitive changes need the password, or a two-step code when the account has no password."""
    if person.password:
        if not verify_password(password or "", person.password):
            raise field_error(422, "password", "Your password isn't right")
        return
    if person.two_factor_enabled:
        if totp.verify_code(person.two_factor_secret, code) is None:
            raise field_error(422, "code", "That code isn't right")


def two_factor_status(person: Customer) -> dict:
    return {"enabled": person.two_factor_enabled, "confirmed_at": iso(person.two_factor_confirmed_at),
            "recovery_left": len(person.two_factor_recovery_codes or []) if person.two_factor_enabled else 0}


def setup(db: Session, ws: Customer) -> dict:
    person = _person(ws)
    if person.two_factor_enabled:
        raise HTTPException(status_code=409, detail="Two-step sign-in is already on.")
    secret = totp.new_secret()
    person.two_factor_secret = encrypt_secret(secret)
    person.two_factor_confirmed_at = None
    db.commit()
    uri = totp.otpauth_uri(secret, person.email or person.phone or f"user-{person.id}", ISSUER)
    return {"status": True, "data": {"secret": secret, "uri": uri, "qr_svg": totp.qr_svg(uri)}}


def confirm(db: Session, ws: Customer, code: str) -> dict:
    person = _person(ws)
    if person.two_factor_enabled:
        raise HTTPException(status_code=409, detail="Two-step sign-in is already on.")
    step = totp.verify_code(person.two_factor_secret, code)
    if step is None:
        raise field_error(422, "code", "That code isn't right. Make sure your phone's time is correct.")
    plain, hashes = totp.new_recovery_codes()
    person.two_factor_confirmed_at, person.two_factor_last_step = now(), step
    person.two_factor_recovery_codes = hashes
    db.commit()
    _tell(db, person, "Two-step sign-in is on",
          "From now on, signing in also asks for a code from your authenticator app.")
    return {"status": True, "message": "Two-step sign-in is on",
            "data": {"recovery_codes": plain, "two_factor": two_factor_status(person)}}


def new_recovery_codes(db: Session, ws: Customer, password: str | None, code: str | None) -> dict:
    person = _person(ws)
    if not person.two_factor_enabled:
        raise HTTPException(status_code=422, detail="Turn on two-step sign-in first.")
    confirm_identity(person, password, code)
    plain, hashes = totp.new_recovery_codes()
    person.two_factor_recovery_codes = hashes
    db.commit()
    return {"status": True, "message": "New recovery codes made. The old ones no longer work.",
            "data": {"recovery_codes": plain, "two_factor": two_factor_status(person)}}


def disable(db: Session, ws: Customer, password: str | None, code: str | None) -> dict:
    person = _person(ws)
    if not person.two_factor_enabled:
        raise HTTPException(status_code=422, detail="Two-step sign-in is already off.")
    confirm_identity(person, password, code)
    person.two_factor_secret = person.two_factor_recovery_codes = None
    person.two_factor_confirmed_at = person.two_factor_last_step = None
    db.commit()
    _tell(db, person, "Two-step sign-in was turned off",
          "If this wasn't you, change your password and turn it back on.")
    return {"status": True, "message": "Two-step sign-in is off", "data": two_factor_status(person)}


def _tell(db: Session, person: Customer, subject: str, text: str) -> None:
    from app.core.mailer import mail_enabled, send_mail

    if person.email and mail_enabled(db):
        try:
            send_mail(db, person.email, subject, subject, f"<p>{text}</p>")
        except Exception:  # noqa: BLE001
            pass


# History and devices ---------------------------------------------------------------------------------

def login_history(db: Session, ws: Customer, limit: int = 50) -> dict:
    person = _person(ws)
    rows = (db.query(CustomerLoginEvent).filter(CustomerLoginEvent.customer_id == person.id)
            .order_by(CustomerLoginEvent.id.desc()).limit(limit).all())
    return {"status": True, "data": [
        {"id": r.id, "method": METHODS.get(r.method, r.method), "success": r.success, "reason": r.reason,
         "ip_address": r.ip_address, **describe_agent(r.user_agent), "created_at": iso(r.created_at)}
        for r in rows]}


def sign_out_others(db: Session, ws: Customer, request: Request) -> dict:
    person = _person(ws)
    current = getattr(request.state, "customer_session", None)
    count = db.query(CustomerSession).filter(
        CustomerSession.customer_id == person.id, CustomerSession.revoked_at.is_(None),
        CustomerSession.id != (current.id if current else 0)).update({"revoked_at": now()})
    db.commit()
    return {"status": True, "message": f"Signed out of {count} other device{'s' if count != 1 else ''}",
            "data": {"count": count}}


# Google ------------------------------------------------------------------------------------------------

def link_google(db: Session, ws: Customer, credential: str) -> dict:
    from app.modules.customer.auth.service import _cfg
    from app.services.google_auth import GoogleAuthError, verify_id_token

    person = _person(ws)
    cfg = _cfg(db)
    if not cfg["google_enabled"] or not cfg["google_client_id"]:
        raise HTTPException(status_code=403, detail="Signing in with Google is turned off.")
    try:
        profile = verify_id_token(credential, cfg["google_client_id"])
    except GoogleAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    taken = db.query(Customer.id).filter(Customer.not_deleted(), Customer.google_id == profile.sub,
                                         Customer.id != person.id).first()
    if taken:
        raise HTTPException(status_code=409, detail="This Google account is already connected to another account.")
    person.google_id = profile.sub
    if not person.avatar and profile.picture:
        person.avatar = profile.picture
    db.commit()
    return {"status": True, "message": "Google connected: you can now sign in with it",
            "data": serialize_customer(person)}


def unlink_google(db: Session, ws: Customer) -> dict:
    person = _person(ws)
    if not person.google_id:
        raise HTTPException(status_code=422, detail="Google isn't connected.")
    if not person.password and not person.phone_verified_at:
        raise HTTPException(status_code=422, detail="Set a password or verify your mobile number first, "
                                                    "so you can still sign in.")
    person.google_id = None
    db.commit()
    return {"status": True, "message": "Google disconnected", "data": serialize_customer(person)}
