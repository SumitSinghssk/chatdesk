from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.auth import service
from app.modules.customer.auth.schemas import (
    GoogleLoginSchema, LoginSchema, OtpSendSchema, OtpVerifySchema, RegisterSchema,
)

public_router = APIRouter(prefix="/auth", tags=["Customer Auth"])
_csrf = Depends(require_customer_csrf)


@public_router.get("/options")
def options(db: Session = Depends(get_db)):
    return service.options(db)


@public_router.post("/register", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def register(payload: RegisterSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.register(db, payload, request, response)


@public_router.post("/login", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def login(payload: LoginSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.login(db, payload, request, response)


@public_router.post("/otp/send", dependencies=[Depends(RateLimit(5, 60)), _csrf])
def otp_send(payload: OtpSendSchema, request: Request, db: Session = Depends(get_db)):
    return service.send_login_otp(db, payload, request)


@public_router.post("/otp/verify", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def otp_verify(payload: OtpVerifySchema, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.verify_login_otp(db, payload, request, response)


@public_router.post("/google", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def google(payload: GoogleLoginSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.google_login(db, payload, request, response)


@public_router.post("/logout", dependencies=[_csrf])
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    return service.logout(db, request, response)
