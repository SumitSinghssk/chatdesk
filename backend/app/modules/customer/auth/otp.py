import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.customer.account.models import CustomerOtp
from app.services.sms import send_template
from app.shared.utils.datetime import now
from app.shared.utils.request_meta import client_ip

TEMPLATES = {"login": "login_otp", "phone": "phone_verification"}
HOURLY_LIMIT = 10


def _hash(phone: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), f"{phone}:{code}".encode("utf-8"),
                    hashlib.sha256).hexdigest()


def _cfg(db: Session) -> dict:
    from app.modules.admin.settings.service import get_group

    return get_group(db, "customer_auth")


def issue(db: Session, phone: str, purpose: str, request: Request, customer_id: int | None = None) -> dict:
    cfg = _cfg(db)
    current = now()
    latest = (db.query(CustomerOtp).filter(CustomerOtp.phone == phone, CustomerOtp.purpose == purpose)
              .order_by(CustomerOtp.id.desc()).first())
    if latest:
        wait = int(cfg["otp_resend_seconds"] - (current - latest.created_at).total_seconds())
        if wait > 0:
            raise HTTPException(status_code=429, detail={
                "message": f"Please wait {wait} seconds before asking for a new code.",
                "errors": {"phone": [f"Wait {wait} seconds before resending."]}, "data": {"resend_in": wait},
            })
    recent = db.query(CustomerOtp).filter(CustomerOtp.phone == phone,
                                          CustomerOtp.created_at >= current - timedelta(hours=1)).count()
    if recent >= HOURLY_LIMIT:
        raise HTTPException(status_code=429, detail="Too many codes requested for this number. Try again later.")

    length = int(cfg["otp_length"])
    code = str(secrets.randbelow(10 ** length)).zfill(length)
    db.query(CustomerOtp).filter(CustomerOtp.phone == phone, CustomerOtp.purpose == purpose,
                                 CustomerOtp.consumed_at.is_(None)).update({"consumed_at": current})
    minutes = int(cfg["otp_expiry_minutes"])
    result = send_template(db, TEMPLATES[purpose], phone, {"code": code, "minutes": minutes})
    if not result.sent and (result.attempts or settings.is_production):
        db.rollback()
        raise HTTPException(status_code=503, detail="We couldn't send the code right now. Please try again shortly.")
    db.add(CustomerOtp(phone=phone, purpose=purpose, customer_id=customer_id, code_hash=_hash(phone, code),
                       gateway=result.gateway, ip_address=client_ip(request), created_at=current,
                       expires_at=current + timedelta(minutes=minutes)))
    db.commit()
    return {"expires_in": minutes * 60, "resend_in": int(cfg["otp_resend_seconds"]), "length": length}


def verify(db: Session, phone: str, code: str, purpose: str) -> CustomerOtp:
    cfg = _cfg(db)
    current = now()
    row = (db.query(CustomerOtp)
           .filter(CustomerOtp.phone == phone, CustomerOtp.purpose == purpose, CustomerOtp.consumed_at.is_(None))
           .order_by(CustomerOtp.id.desc()).with_for_update().first())
    if row is None or row.expires_at <= current:
        raise HTTPException(status_code=422, detail={"message": "This code has expired. Request a new one.",
                                                     "errors": {"code": ["This code has expired."]}})
    if row.attempts >= int(cfg["otp_max_attempts"]):
        row.consumed_at = current
        db.commit()
        raise HTTPException(status_code=429, detail={"message": "Too many wrong attempts. Request a new code.",
                                                     "errors": {"code": ["Too many wrong attempts."]}})
    if not hmac.compare_digest(row.code_hash, _hash(phone, (code or "").strip())):
        row.attempts += 1
        left = int(cfg["otp_max_attempts"]) - row.attempts
        db.commit()
        message = f"That code isn't right. {left} attempt{'s' if left != 1 else ''} left." if left else \
            "That code isn't right. Request a new code."
        raise HTTPException(status_code=422, detail={"message": message, "errors": {"code": [message]}})
    row.consumed_at = current
    return row
