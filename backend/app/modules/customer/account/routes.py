from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer, require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account import service
from app.modules.customer.account.models import Customer
from app.modules.customer.account.schemas import (
    PasswordUpdateSchema, PhoneSendSchema, PhoneVerifySchema, ProfileUpdateSchema,
)

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
