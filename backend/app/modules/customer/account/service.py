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
    if email != customer.email:
        if email and db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != customer.id,
                                                  func.lower(Customer.email) == email).first():
            raise field_error(409, "email", "Another account already uses this email")
        if not email and not customer.phone and not customer.google_id:
            raise field_error(422, "email", "Keep an email or a mobile number on your account")
        customer.email = email
        customer.email_verified_at = None
    customer.name = payload.name.strip()
    if customer.workspace_id is None:  # team members don't own the business name
        customer.business_name = payload.business_name.strip() if payload.business_name else None
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
