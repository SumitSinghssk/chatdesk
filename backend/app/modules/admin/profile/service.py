from fastapi import HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.mailer import send_template
from app.core.security import hash_password, verify_password
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.auth import two_factor
from app.modules.admin.auth.models import UserSession
from app.modules.admin.auth.service import access_token, rotate_refresh_token, serialize_auth_user
from app.modules.admin.email_templates.service import device_variables
from app.modules.admin.media.models import MediaFile
from app.modules.admin.profile.schemas import ChangePasswordSchema, ProfileUpdateSchema
from app.modules.admin.settings.service import get_group
from app.modules.admin.users.models import User
from app.modules.admin.users.service import active_sessions, check_password
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import describe_agent
from app.shared.utils.uploads import delete_stored_file, save_upload

SUBJECT = "user"


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _require_password(user: User, password: str, field: str = "password") -> None:
    if not verify_password(password, user.password):
        raise _field_error(field, "The password is incorrect")


def _log(db: Session, action: str, user: User, request: Request, description: str, **kwargs) -> None:
    log_activity(db, action, request=request, user=user, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description=description, **kwargs)


def show(user: User):
    return {"status": True, "data": serialize_auth_user(user)}


def update(db: Session, user: User, payload: ProfileUpdateSchema, request: Request):
    before = {"name": user.name, "phone": user.phone, "bio": user.bio, "social_links": user.social_links or {}}
    user.name = payload.name.strip()
    user.phone = (payload.phone or "").strip() or None
    user.bio = (payload.bio or "").strip() or None
    user.social_links = payload.social_links.model_dump(exclude_none=True) or None
    old, new = diff(before, {"name": user.name, "phone": user.phone, "bio": user.bio,
                             "social_links": user.social_links or {}})
    _log(db, "updated", user, request, "Updated own profile", old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Profile updated", "data": serialize_auth_user(user)}


def _image_size(path) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(path) as img:
            return img.width, img.height
    except Exception:
        return None, None


def _remove_avatar_file(db: Session, url: str | None) -> None:
    if not url:
        return
    db.query(MediaFile).filter(MediaFile.url == url).delete(synchronize_session=False)
    delete_stored_file(url)


def upload_avatar(db: Session, user: User, file: UploadFile, request: Request):
    meta = save_upload(file, "avatars")
    width, height = _image_size(meta["absolute_path"])
    db.add(MediaFile(
        folder="avatars", filename=meta["filename"], original_name=meta["original_name"], path=meta["path"],
        url=meta["url"], mime=meta["mime"], extension=meta["extension"], size=meta["size"],
        width=width, height=height, uploaded_by=user.id,
    ))
    old = user.avatar
    user.avatar = meta["url"]
    _log(db, "updated", user, request, "Changed profile photo")
    try:
        db.commit()
    except Exception:
        delete_stored_file(meta["url"])
        raise
    if old and old != user.avatar:
        _remove_avatar_file(db, old)
        db.commit()
    return {"status": True, "message": "Profile photo updated", "data": serialize_auth_user(user)}


def delete_avatar(db: Session, user: User, request: Request):
    if user.avatar:
        _remove_avatar_file(db, user.avatar)
        user.avatar = None
        _log(db, "updated", user, request, "Removed profile photo")
        db.commit()
    return {"status": True, "message": "Profile photo removed", "data": serialize_auth_user(user)}


def change_password(db: Session, user: User, session_id: str, payload: ChangePasswordSchema, request: Request,
                    response: Response):
    _require_password(user, payload.current_password, "current_password")
    check_password(db, payload.password, payload.password_confirmation)
    if verify_password(payload.password, user.password):
        raise _field_error("password", "Choose a password different from your current one")

    user.password = hash_password(payload.password)
    user.token_version += 1
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.id != session_id, UserSession.revoked_at.is_(None)
    ).update({UserSession.revoked_at: now()}, synchronize_session=False)

    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    token_payload = {"sub": str(user.id), "sid": session_id, "token_version": user.token_version}
    if session:
        rotate_refresh_token(session, response, token_payload, user.id)
        session.last_active_at = now()
    _log(db, "password_changed", user, request, "Changed own password; other sessions signed out")
    db.commit()

    send_template(db, "password_changed", user.email,
                  {"name": user.name, "email": user.email, **device_variables(request)})
    return {
        "status": True,
        "message": "Password changed. Other sessions were signed out.",
        "data": access_token(db, token_payload),
    }


def _serialize_session(row: UserSession, current_id: str) -> dict:
    return {
        "id": row.id,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        **describe_agent(row.user_agent),
        "remember": row.remember,
        "created_at": iso(row.created_at),
        "last_active_at": iso(row.last_active_at),
        "expires_at": iso(row.expires_at),
        "is_current": row.id == current_id,
    }


def list_sessions(db: Session, user: User, session_id: str):
    rows = sorted(active_sessions(db, user.id), key=lambda s: s.id != session_id)
    return {"status": True, "data": [_serialize_session(r, session_id) for r in rows]}


def revoke_session(db: Session, user: User, current_id: str, target_id: str, request: Request):
    if target_id == current_id:
        raise HTTPException(status_code=400, detail="Use sign out to end your current session")
    row = (
        db.query(UserSession)
        .filter(UserSession.id == target_id, UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    row.revoked_at = now()
    _log(db, "session_revoked", user, request, f"Signed out a session from {row.ip_address or 'unknown IP'}")
    db.commit()
    return {"status": True, "message": "Session ended"}


def revoke_other_sessions(db: Session, user: User, current_id: str, request: Request):
    count = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.id != current_id, UserSession.revoked_at.is_(None))
        .update({UserSession.revoked_at: now()}, synchronize_session=False)
    )
    _log(db, "sessions_revoked", user, request, f"Signed out {count} other session(s)")
    db.commit()
    return {"status": True, "message": f"{count} other session(s) ended"}


def _two_factor_status(user: User) -> dict:
    return {
        "enabled": user.two_factor_enabled,
        "confirmed_at": iso(user.two_factor_confirmed_at),
        "recovery_codes_left": len(user.two_factor_recovery_codes or []) if user.two_factor_enabled else 0,
        "required_by_role": bool(user.role and user.role.requires_two_factor),
    }


def two_factor_status(user: User):
    return {"status": True, "data": _two_factor_status(user)}


def two_factor_setup(db: Session, user: User):
    if user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor sign-in is already enabled")
    secret = two_factor.new_secret()
    user.two_factor_secret = encrypt_secret(secret)
    user.two_factor_recovery_codes = None
    user.two_factor_last_step = None
    db.commit()
    issuer = get_group(db, "general").get("app_name") or "Admin"
    uri = two_factor.otpauth_uri(secret, user.email, issuer)
    return {"status": True, "message": "Scan the QR code with your authenticator app",
            "data": {"secret": secret, "otpauth_uri": uri, "qr_svg": two_factor.qr_svg(uri)}}


def two_factor_confirm(db: Session, user: User, code: str, request: Request):
    if user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor sign-in is already enabled")
    if not user.two_factor_secret:
        raise HTTPException(status_code=400, detail="Start the two-factor setup first")
    step = two_factor.verify_code(user.two_factor_secret, code, user.two_factor_last_step)
    if step is None:
        raise _field_error("code", "The code is invalid or has expired.")
    user.two_factor_last_step = step
    plain, hashes = two_factor.new_recovery_codes()
    user.two_factor_confirmed_at = now()
    user.two_factor_recovery_codes = hashes
    _log(db, "two_factor_enabled", user, request, "Turned on two-factor sign-in")
    db.commit()
    send_template(db, "two_factor_enabled", user.email,
                  {"name": user.name, "email": user.email, **device_variables(request)})
    return {"status": True, "message": "Two-factor sign-in enabled",
            "data": {**_two_factor_status(user), "recovery_codes": plain}}


def regenerate_recovery_codes(db: Session, user: User, password: str, request: Request):
    _require_password(user, password)
    if not user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor sign-in is not enabled")
    plain, hashes = two_factor.new_recovery_codes()
    user.two_factor_recovery_codes = hashes
    _log(db, "two_factor_recovery_regenerated", user, request, "Generated new recovery codes")
    db.commit()
    send_template(db, "two_factor_changed", user.email,
                  {"name": user.name, "email": user.email, **device_variables(request)})
    return {"status": True, "message": "New recovery codes generated",
            "data": {**_two_factor_status(user), "recovery_codes": plain}}


def two_factor_disable(db: Session, user: User, password: str, request: Request):
    _require_password(user, password)
    if not user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Two-factor sign-in is not enabled")
    if user.role and user.role.requires_two_factor:
        raise HTTPException(status_code=400, detail="Your role requires two-factor sign-in, so it can't be turned off")
    user.two_factor_secret = None
    user.two_factor_recovery_codes = None
    user.two_factor_confirmed_at = None
    _log(db, "two_factor_disabled", user, request, "Turned off two-factor sign-in")
    db.commit()
    send_template(db, "two_factor_disabled", user.email,
                  {"name": user.name, "email": user.email, **device_variables(request)})
    return {"status": True, "message": "Two-factor sign-in disabled", "data": _two_factor_status(user)}
