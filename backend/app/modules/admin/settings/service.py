from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

import copy

from app.core.cache import local_cache
from app.core.crypto import decrypt_secret, encrypt_secret
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.settings.defaults import DEFAULTS, PUBLIC_GROUPS, SECRET_KEYS
from app.modules.admin.settings.models import Setting
from app.modules.admin.settings.schemas import GROUP_SCHEMAS

SCRIPTS_ONLY_SUPER_ADMIN = "Only a super admin can change scripts and custom CSS"


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _is_super_admin(request: Request | None) -> bool:
    user = getattr(request.state, "user", None) if request is not None else None
    return bool(user and user.is_super_admin)


def _row(db: Session, key: str) -> Setting | None:
    return db.query(Setting).filter(Setting.key == key).first()


_stored_cache = local_cache("settings", ttl=30)


def _stored(db: Session, key: str, fresh: bool = False) -> dict:
    def load() -> dict:
        row = _row(db, key)
        return row.value if row and isinstance(row.value, dict) else {}

    if fresh:
        return copy.deepcopy(load())
    return copy.deepcopy(_stored_cache.get_or_set(key, load))


def get_group(db: Session, key: str, *, with_secrets: bool = False, fresh: bool = False) -> dict:
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Unknown settings group '{key}'")
    stored = _stored(db, key, fresh)
    merged = {**DEFAULTS[key], **stored}
    for secret in SECRET_KEYS.get(key, set()):
        if with_secrets:
            merged[secret] = decrypt_secret(merged.get(secret))
        else:
            merged[f"has_{secret}"] = bool(merged.get(secret))
            merged.pop(secret, None)
    return merged


def get_all(db: Session) -> dict:
    return {"status": True, "data": {key: get_group(db, key, fresh=True) for key in DEFAULTS}}


def show(db: Session, key: str) -> dict:
    return {"status": True, "data": get_group(db, key, fresh=True)}


def update_group(db: Session, key: str, payload: dict, request: Request | None = None) -> dict:
    schema = GROUP_SCHEMAS.get(key)
    if schema is None:
        raise HTTPException(status_code=404, detail=f"Unknown settings group '{key}'")
    try:
        data = schema.model_validate(payload).model_dump()
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False))

    if key == "customer_auth":
        if not (data["password_enabled"] or data["otp_enabled"] or data["google_enabled"]):
            raise _field_error("password_enabled", "Keep at least one sign-in method turned on")
        if data["google_enabled"] and not data["google_client_id"]:
            raise _field_error("google_client_id", "Add the Google client ID to turn on Google sign-in")

    row = _row(db, key)
    current = row.value if row and isinstance(row.value, dict) else {}
    stored = {**DEFAULTS[key], **current}
    before = get_group(db, key, fresh=True)

    if key == "scripts" and not _is_super_admin(request):
        for field, value in data.items():
            if (value or "") != (stored.get(field) or ""):
                raise _field_error(field, SCRIPTS_ONLY_SUPER_ADMIN)

    endpoint_changed = key == "mail" and any(
        (data.get(f) or "").strip() != (stored.get(f) or "").strip() for f in ("host", "username")
    )
    secret_changes: dict[str, str] = {}
    for secret in SECRET_KEYS.get(key, set()):
        incoming = data.get(secret)
        if incoming:
            data[secret] = encrypt_secret(incoming)
            secret_changes[secret] = "changed"
        else:
            data[secret] = None if endpoint_changed else current.get(secret)
            if current.get(secret) and not data[secret]:
                secret_changes[secret] = "cleared"

    if row is None:
        row = Setting(key=key, value=data)
        db.add(row)
    else:
        row.value = data

    db.flush()
    old, new = diff(before, get_group(db, key, fresh=True))
    for secret, change in secret_changes.items():
        old.pop(f"has_{secret}", None)
        new.pop(f"has_{secret}", None)
        old[secret] = "••••••" if before.get(f"has_{secret}") else None
        new[secret] = "•••••• (new value)" if change == "changed" else None
    if not old and not new:
        db.commit()
        return {"status": True, "message": "Settings saved", "data": get_group(db, key, fresh=True)}
    log_activity(db, "updated", request=request, subject_type="settings", subject_label=key,
                 description=f"Updated {key.replace('_', ' ')} settings: {', '.join(sorted(new)) or 'no fields'}",
                 old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Settings saved", "data": get_group(db, key, fresh=True)}


def public_settings(db: Session) -> dict:
    data = {}
    for key, fields in PUBLIC_GROUPS.items():
        group = get_group(db, key)
        data[key] = group if fields is None else {f: group.get(f) for f in fields}
    return {"status": True, "data": data}
