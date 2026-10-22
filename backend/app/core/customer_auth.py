from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import random_token, sha256
from app.modules.customer.account.models import Customer, CustomerSession
from app.shared.enums import Status
from app.shared.utils.datetime import now
from app.shared.utils.request_meta import client_ip, user_agent

SESSION_COOKIE = "sk_customer"
HINT_COOKIE = "sk_member"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "sk-web"
TOUCH_EVERY = timedelta(minutes=1)
NOT_SIGNED_IN = "Please sign in to continue"


def require_customer_csrf(request: Request) -> None:
    if request.headers.get(CSRF_HEADER, "").lower() != CSRF_VALUE:
        raise HTTPException(status_code=403, detail="Missing or invalid X-Requested-With header")


def _session_days(db: Session) -> int:
    from app.modules.admin.settings.service import get_group

    return int(get_group(db, "customer_auth").get("session_days") or 30)


def set_session_cookies(response: Response, token: str, days: int) -> None:
    max_age = days * 86400
    secure = settings.is_production
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, path="/", httponly=True, secure=secure,
                        samesite="lax")
    response.set_cookie(HINT_COOKIE, "1", max_age=max_age, path="/", httponly=False, secure=secure, samesite="lax")


def clear_session_cookies(response: Response) -> None:
    secure = settings.is_production
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=secure, samesite="lax")
    response.delete_cookie(HINT_COOKIE, path="/", httponly=False, secure=secure, samesite="lax")


def start_session(db: Session, customer: Customer, request: Request, response: Response, method: str) -> None:
    days = _session_days(db)
    token = random_token(32)
    current = now()
    db.add(CustomerSession(customer_id=customer.id, token_hash=sha256(token), method=method,
                           ip_address=client_ip(request), user_agent=user_agent(request), created_at=current,
                           last_active_at=current, expires_at=current + timedelta(days=days)))
    customer.last_login_at = current
    customer.last_login_ip = client_ip(request)
    customer.last_login_method = method
    set_session_cookies(response, token, days)


def current_session(db: Session, request: Request) -> CustomerSession | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return db.query(CustomerSession).filter(
        CustomerSession.token_hash == sha256(token), CustomerSession.revoked_at.is_(None)
    ).first()


def require_customer(request: Request, db: Session = Depends(get_db)) -> Customer:
    session = current_session(db, request)
    current = now()
    if session is None or session.expires_at <= current:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)
    customer = db.query(Customer).filter(Customer.id == session.customer_id, Customer.not_deleted()).first()
    if customer is None or customer.status != Status.ACTIVE.value:
        session.revoked_at = current
        db.commit()
        raise HTTPException(status_code=401, detail="Your account isn't active. Please contact us.")
    if current - session.last_active_at >= TOUCH_EVERY:
        session.last_active_at = current
        db.commit()
    request.state.customer = customer
    request.state.customer_session = session
    return customer
