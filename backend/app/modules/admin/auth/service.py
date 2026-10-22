import hmac
import uuid
from datetime import timedelta
from functools import lru_cache

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session, object_session

from app.core.admin_auth import load_user
from app.core.config import DEFAULT_APP_NAME, settings
from app.core.mailer import send_template
from app.core.security import (
    ACCESS,
    REFRESH,
    TWO_FACTOR,
    create_access_token,
    create_refresh_token,
    create_two_factor_token,
    decode_token,
    hash_password,
    random_token,
    sha256,
    verify_password,
)
from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.auth import two_factor
from app.modules.admin.auth.cookies import clear_session_cookies, set_session_cookies
from app.modules.admin.auth.models import PasswordResetToken, UserSession
from app.modules.admin.email_templates.service import device_variables, format_when
from app.modules.admin.notifications.service import notify_admins
from app.modules.admin.settings.service import get_group
from app.modules.admin.users.models import User
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.datetime import DEFAULT_TIMEZONE, iso, now
from app.shared.utils.request_meta import client_ip, user_agent
from app.shared.constants import admin_urls as urls
from app.shared.constants.admin_urls import admin_url



def lifetimes(db: Session) -> dict:
    cfg = get_group(db, "security")
    return {
        "access_minutes": int(cfg.get("access_token_minutes") or 30),
        "refresh_days": int(cfg.get("refresh_token_days") or 7),
        "remember_days": int(cfg.get("remember_days") or 30),
        "reset_minutes": int(cfg.get("password_reset_minutes") or 60),
    }


def access_token(db: Session, payload: dict) -> dict:
    minutes = lifetimes(db)["access_minutes"]
    return {"access_token": create_access_token(payload, minutes), "token_type": "bearer",
            "expires_in": minutes * 60}
REFRESH_GRACE = timedelta(seconds=30)
_INVALID = "These credentials do not match our records."
_ENDED = "Your session has ended. Please log in again."


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password(uuid.uuid4().hex)


def serialize_auth_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "bio": user.bio,
        "social_links": user.social_links or {},
        "status": user.status,
        "role": {"id": user.role.id, "name": user.role.name} if user.role else None,
        "permissions": user.permission_names(),
        "two_factor_enabled": user.two_factor_enabled,
        "two_factor_required": bool(user.role and user.role.requires_two_factor),
        "last_login_at": iso(user.last_login_at),
        "created_at": iso(user.created_at),
        "idle_minutes": _idle_minutes(user),
        "site": _site(user),
    }


def _site(user: User) -> dict:
    db = object_session(user)
    if db is None:
        return {"name": DEFAULT_APP_NAME, "timezone": DEFAULT_TIMEZONE}
    return {"name": get_group(db, "general").get("app_name") or DEFAULT_APP_NAME,
            "timezone": get_group(db, "date_time").get("timezone") or DEFAULT_TIMEZONE}


def _idle_minutes(user: User) -> int:
    db = object_session(user)
    if db is None:
        return 0
    try:
        return max(0, int(get_group(db, "security").get("idle_minutes") or 0))
    except Exception:
        return 0


def _token_payload(user: User, session_id: str) -> dict:
    return {"sub": str(user.id), "sid": session_id, "token_version": user.token_version}


def rotate_refresh_token(session: UserSession, response: Response, payload: dict, user_id: int) -> None:
    life = lifetimes(object_session(session))
    days = life["remember_days"] if session.remember else life["refresh_days"]
    refresh = create_refresh_token(payload, days=days)
    if session.refresh_token_hash:
        session.previous_refresh_hash = session.refresh_token_hash
        session.rotated_at = now()
    session.refresh_token_hash = sha256(refresh)
    set_session_cookies(response, refresh, user_id, session.expires_at, bool(session.remember))


def issue_tokens(db: Session, user: User, request: Request | None, remember: bool, response: Response) -> dict:
    life = lifetimes(db)
    days = life["remember_days"] if remember else life["refresh_days"]
    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        ip_address=client_ip(request),
        user_agent=user_agent(request),
        remember=remember,
        expires_at=now() + timedelta(days=days),
    )
    db.add(session)
    payload = _token_payload(user, session.id)
    rotate_refresh_token(session, response, payload, user.id)

    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now()
    user.last_login_ip = client_ip(request)
    log_activity(db, "login", request=request, user=user, subject_type="user",
                 subject_id=user.id, subject_label=user.email, description="Signed in")
    db.commit()

    return {
        **access_token(db, payload),
        "remember": remember,
        "user": serialize_auth_user(user),
    }


def _register_failure(db: Session, user: User, request: Request, what: str = "sign-in attempt") -> None:
    security = get_group(db, "security")
    user.failed_logins = (user.failed_logins or 0) + 1
    log_activity(db, "login_failed", request=request, user=user, subject_type="user",
                 subject_id=user.id, subject_label=user.email,
                 description=f"Failed {what} #{user.failed_logins}")

    if security.get("lockout_enabled") and user.failed_logins >= int(security.get("lockout_attempts", 5)):
        minutes = int(security.get("lockout_minutes", 15))
        user.locked_until = now() + (timedelta(minutes=minutes) if minutes > 0 else timedelta(days=36500))
        log_activity(db, "locked", request=request, user=user, subject_type="user", subject_id=user.id,
                     subject_label=user.email, description="Account locked after too many failed sign-ins")
        notify_admins(db, permission=P.USERS_MANAGE_SECURITY, type="auth.locked",
                      title="Account locked",
                      message=f"{user.email} was locked after {user.failed_logins} failed sign-ins.",
                      url=admin_url(urls.USERS, open=user.id))
        db.commit()
        unlock_info = ("An administrator needs to unlock it." if minutes <= 0
                       else f"It unlocks by itself at {format_when(user.locked_until)}.")
        send_template(db, "account_locked", user.email, {
            "name": user.name, "email": user.email, "failures": str(user.failed_logins),
            "unlock_info": unlock_info, **device_variables(request),
        }, url=f"{settings.FRONTEND_URL.rstrip('/')}/admin/forgot-password")
        return
    db.commit()


def _lock_message(user: User) -> str:
    remaining = user.locked_until - now()
    if remaining > timedelta(days=3650):
        return "Your account is locked. Please contact an administrator."
    minutes = max(1, int(remaining.total_seconds() // 60) + 1)
    return f"Too many failed attempts. Your account is locked for {minutes} more minute(s)."


def login(db: Session, email: str, password: str, remember: bool, request: Request, response: Response):
    user = db.query(User).filter(User.email == email.lower().strip(), User.not_deleted()).first()
    if not user:
        verify_password(password, _dummy_hash())
        log_activity(db, "login_failed", request=request, subject_label=email,
                     description="Sign-in attempt for unknown email")
        db.commit()
        raise HTTPException(status_code=401, detail={"message": _INVALID, "errors": {"email": [_INVALID]}})

    if user.locked_until and user.locked_until > now():
        raise HTTPException(status_code=423, detail=_lock_message(user))

    if not verify_password(password, user.password):
        _register_failure(db, user, request)
        if user.locked_until and user.locked_until > now():
            raise HTTPException(status_code=423, detail=_lock_message(user))
        raise HTTPException(status_code=401, detail={"message": _INVALID, "errors": {"email": [_INVALID]}})

    if user.status != Status.ACTIVE.value:
        raise HTTPException(status_code=403, detail="Your account is not active. Please contact an administrator.")

    if user.two_factor_enabled:
        return {
            "status": True,
            "message": "Two-factor code required",
            "data": {
                "two_factor_required": True,
                "two_factor_token": create_two_factor_token(user.id, remember),
            },
        }

    user = load_user(db, user.id)
    return {"status": True, "message": "Login successful",
            "data": issue_tokens(db, user, request, remember, response)}


def two_factor_challenge(db: Session, token: str, code: str | None, recovery_code: str | None, request: Request,
                         response: Response):
    payload = decode_token(token, TWO_FACTOR)
    if not payload:
        raise HTTPException(status_code=401, detail="Your sign-in attempt expired. Please sign in again.")
    user_id = int(payload["sub"])
    db.query(User.id).filter(User.id == user_id).with_for_update().first()
    user = load_user(db, user_id)
    if not user or not user.two_factor_enabled:
        raise HTTPException(status_code=401, detail="Your sign-in attempt expired. Please sign in again.")
    if user.locked_until and user.locked_until > now():
        raise HTTPException(status_code=423, detail=_lock_message(user))

    if code:
        step = two_factor.verify_code(user.two_factor_secret, code, user.two_factor_last_step)
        ok = step is not None
        if ok:
            user.two_factor_last_step = step
    else:
        remaining = two_factor.consume_recovery_code(user.two_factor_recovery_codes, recovery_code)
        ok = remaining is not None
        if ok:
            user.two_factor_recovery_codes = remaining
            log_activity(db, "two_factor_recovery_used", request=request, user=user, subject_type="user",
                         subject_id=user.id, subject_label=user.email,
                         description=f"Used a recovery code ({len(remaining)} left)")

    if not ok:
        field = "code" if code else "recovery_code"
        msg = "The code is invalid or has expired." if code else "That recovery code is not valid."
        _register_failure(db, user, request, "two-factor code")
        if user.locked_until and user.locked_until > now():
            raise HTTPException(status_code=423, detail=_lock_message(user))
        raise HTTPException(status_code=422, detail={"message": msg, "errors": {field: [msg]}})

    tokens = issue_tokens(db, user, request, bool(payload.get("remember")), response)
    if not code:
        send_template(db, "two_factor_recovery", user.email,
                      {"name": user.name, "email": user.email, **device_variables(request)})
    return {"status": True, "message": "Login successful", "data": tokens}


def refresh_token(db: Session, token: str | None, response: Response):
    payload = decode_token(token, REFRESH) if token else None
    if not payload:
        raise HTTPException(status_code=401, detail=_ENDED)
    session = db.query(UserSession).filter(UserSession.id == payload.get("sid")).with_for_update().first()
    presented = sha256(token)
    if session and session.revoked_at is None and not hmac.compare_digest(session.refresh_token_hash or "", presented):
        if (
            session.previous_refresh_hash
            and hmac.compare_digest(session.previous_refresh_hash, presented)
            and session.rotated_at
            and now() - session.rotated_at <= REFRESH_GRACE
        ):
            db.rollback()
            raise HTTPException(status_code=409, detail="Session refreshed in another tab")
        session.revoked_at = now()
        db.commit()
        raise HTTPException(status_code=401, detail=_ENDED)
    if (
        not session
        or session.revoked_at is not None
        or session.expires_at < now()
    ):
        raise HTTPException(status_code=401, detail=_ENDED)

    user = load_user(db, session.user_id)
    if not user or user.status != Status.ACTIVE.value:
        raise HTTPException(status_code=401, detail=_ENDED)
    if payload.get("token_version") != user.token_version:
        raise HTTPException(status_code=401, detail="Your session has ended because your account or access was changed. Please log in again.")

    new_payload = _token_payload(user, session.id)
    rotate_refresh_token(session, response, new_payload, user.id)
    session.last_active_at = now()
    db.commit()
    return {
        "status": True,
        "message": "Token refreshed",
        "data": {
            **access_token(db, new_payload),
            "user": serialize_auth_user(user),
        },
    }


def logout(db: Session, request: Request, response: Response, access_token: str | None,
           refresh_cookie: str | None):
    payload = (decode_token(access_token, ACCESS) if access_token else None) or (
        decode_token(refresh_cookie, REFRESH) if refresh_cookie else None
    )
    session = None
    if payload:
        session = db.query(UserSession).filter(UserSession.id == payload.get("sid")).first()
        if session and str(session.user_id) != str(payload.get("sub")):
            session = None
    if session and session.revoked_at is None:
        session.revoked_at = now()
        user = load_user(db, session.user_id)
        if user:
            log_activity(db, "logout", request=request, user=user, subject_type="user",
                         subject_id=user.id, subject_label=user.email, description="Signed out")
        db.commit()
    clear_session_cookies(response)
    return {"status": True, "message": "Logged out successfully"}


def me(user: User):
    return {"status": True, "data": serialize_auth_user(user)}


def forgot_password(db: Session, email: str, request: Request):
    generic = {"status": True, "message": "If that email belongs to an account, a reset link is on its way."}
    user = db.query(User).filter(User.email == email.lower().strip(), User.not_deleted()).first()
    if not user or user.status != Status.ACTIVE.value:
        return generic

    db.query(PasswordResetToken).filter(PasswordResetToken.email == user.email).delete()
    token = random_token(32)
    db.add(PasswordResetToken(email=user.email, token_hash=sha256(token)))
    log_activity(db, "password_reset_requested", request=request, user=user, subject_type="user",
                 subject_id=user.id, subject_label=user.email, description="Requested a password reset link")
    db.commit()

    link = f"{settings.FRONTEND_URL.rstrip('/')}/admin/reset-password?token={token}&email={user.email}"
    send_template(db, "password_reset", user.email, {
        "name": user.name, "email": user.email, "minutes": str(lifetimes(db)["reset_minutes"]),
        **device_variables(request),
    }, url=link)
    return generic


def reset_password(db: Session, token: str, email: str, password: str, request: Request):
    invalid = HTTPException(status_code=422, detail={
        "message": "This reset link is invalid or has expired.",
        "errors": {"token": ["This reset link is invalid or has expired."]},
    })
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == sha256(token)).first()
    if not row or row.email != email.lower().strip():
        raise invalid
    if row.created_at < now() - timedelta(minutes=lifetimes(db)["reset_minutes"]):
        db.delete(row)
        db.commit()
        raise invalid

    min_length = int(get_group(db, "security").get("password_min_length", 8))
    if len(password) < min_length:
        msg = f"Password must be at least {min_length} characters"
        raise HTTPException(status_code=422, detail={"message": msg, "errors": {"password": [msg]}})

    user = db.query(User).filter(User.email == row.email, User.not_deleted()).first()
    if not user:
        raise invalid

    user.password = hash_password(password)
    user.token_version += 1
    user.failed_logins = 0
    user.locked_until = None
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)) \
        .update({UserSession.revoked_at: now()}, synchronize_session=False)
    db.delete(row)
    log_activity(db, "password_reset", request=request, user=user, subject_type="user",
                 subject_id=user.id, subject_label=user.email, description="Reset password via email link")
    db.commit()

    send_template(db, "password_changed", user.email,
                  {"name": user.name, "email": user.email, **device_variables(request)})
    return {"status": True, "message": "Your password has been reset. You can sign in now."}
