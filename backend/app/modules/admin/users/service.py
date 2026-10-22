from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.mailer import send_template
from app.core.security import hash_password
from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.auth.models import UserSession
from app.modules.admin.email_templates.service import device_variables
from app.modules.admin.permissions.models import Permission
from app.modules.admin.roles.models import Role
from app.modules.admin.settings.service import get_group
from app.modules.admin.users.models import User
from app.modules.admin.users.permission_model import UserPermission
from app.modules.admin.users.schemas import UserCreateSchema, UserUpdateSchema
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.request_meta import describe_agent
from app.shared.utils.search import search_clause

SUBJECT = "user"
ONLINE_WINDOW = timedelta(minutes=5)


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def check_password(db: Session, password: str, confirmation: str | None,
                   field: str = "password") -> None:
    min_length = int(get_group(db, "security").get("password_min_length", 8))
    if len(password) < min_length:
        raise _field_error(field, f"Password must be at least {min_length} characters")
    if password != confirmation:
        raise _field_error("password_confirmation", "Passwords do not match")


def _online_expr():
    cutoff = now() - ONLINE_WINDOW
    return (
        select(UserSession.id)
        .where(
            UserSession.user_id == User.id,
            UserSession.revoked_at.is_(None),
            UserSession.last_active_at >= cutoff,
        )
        .correlate(User)
        .exists()
        .label("is_online")
    )


def _serialize_session(row: UserSession, current_id: str | None = None) -> dict:
    return {
        "id": row.id,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        **describe_agent(row.user_agent),
        "created_at": iso(row.created_at),
        "last_active_at": iso(row.last_active_at),
        "expires_at": iso(row.expires_at),
        "is_current": row.id == current_id,
        "revoked": row.revoked_at is not None,
    }


def active_sessions(db: Session, user_id: int) -> list[UserSession]:
    return (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None), UserSession.expires_at > now())
        .order_by(UserSession.last_active_at.desc())
        .all()
    )


def _serialize(user: User, is_online: bool = False) -> dict:
    direct = sorted(user.direct_permissions or [], key=lambda p: p.name)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "bio": user.bio,
        "social_links": user.social_links or {},
        "status": user.status,
        "role_id": user.role_id,
        "role": {"id": user.role.id, "name": user.role.name} if user.role else None,
        "permissions": [p.name for p in direct],
        "direct_permission_ids": [p.id for p in direct],
        "two_factor_enabled": user.two_factor_enabled,
        "is_locked": bool(user.locked_until and user.locked_until > now()),
        "locked_until": iso(user.locked_until),
        "failed_logins": user.failed_logins,
        "last_login_at": iso(user.last_login_at),
        "last_login_ip": user.last_login_ip,
        "is_online": bool(is_online),
        "created_at": iso(user.created_at),
        "updated_at": iso(user.updated_at),
    }


def _snapshot(user: User) -> dict:
    return {"name": user.name, "email": user.email, "phone": user.phone, "role_id": user.role_id,
            "status": user.status, "bio": user.bio, "avatar": user.avatar,
            "social_links": user.social_links or {},
            "permission_ids": sorted(p.permission_id for p in user.user_permissions)}


def _base_query(db: Session):
    return (
        db.query(User, _online_expr())
        .options(joinedload(User.role), selectinload(User.direct_permissions))
        .filter(User.not_deleted())
    )


def _get_or_404(db: Session, user_id: int) -> User:
    row = (
        db.query(User)
        .options(joinedload(User.role), selectinload(User.direct_permissions), selectinload(User.user_permissions))
        .filter(User.id == user_id, User.not_deleted())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row


def _actor(request: Request) -> User:
    return request.state.user


def _outranks(actor: User, target: User) -> bool:
    if actor.is_super_admin or actor.id == target.id:
        return False
    held = set(actor.permission_names())
    return not set(target.permission_names()) <= held


def _guard_target(actor: User, target: User) -> None:
    if target.is_super_admin and not actor.is_super_admin:
        raise HTTPException(status_code=403, detail="Only a super admin can manage a super admin account")
    if _outranks(actor, target):
        raise HTTPException(status_code=403, detail="You can't manage a user who has permissions you don't have")


def _revoke_sessions(db: Session, user_id: int, except_id: str | None = None) -> int:
    q = db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_id:
        q = q.filter(UserSession.id != except_id)
    return q.update({UserSession.revoked_at: now()}, synchronize_session=False)


def _detail(db: Session, user_id: int) -> dict:
    row = _base_query(db).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    data = _serialize(row[0], row[1])
    data["sessions"] = [_serialize_session(s) for s in active_sessions(db, user_id)]
    return data


def _prepare(db: Session, payload, actor: User, target: User | None = None) -> dict:
    data = payload.model_dump(exclude={"password", "password_confirmation", "permission_ids"})
    data["email"] = str(payload.email).lower().strip()
    data["name"] = payload.name.strip()
    data["status"] = payload.status.value
    data["social_links"] = {k: v for k, v in (payload.social_links or {}).items() if v} or None

    clash = db.query(User).filter(func.lower(User.email) == data["email"])
    if target is not None:
        clash = clash.filter(User.id != target.id)
    clash = clash.first()
    if clash:
        if clash.deleted_at is None:
            raise _field_error("email", "This email is already in use")
        raise _field_error("email", "This email belongs to a user in the Trash. Restore or permanently delete it first.")

    if data.get("role_id"):
        role = db.query(Role).filter(Role.id == data["role_id"]).first()
        if not role:
            raise _field_error("role_id", "Selected role does not exist")
        if role.is_super_admin and not actor.is_super_admin:
            raise _field_error("role_id", "Only a super admin can assign the super admin role")
        if not actor.is_super_admin:
            held = set(actor.permission_names())
            missing = sorted(p.name for p in role.permissions or [] if p.name not in held)
            if missing:
                raise _field_error("role_id", "You can't assign a role that has permissions you don't have")

    if target is not None and target.id == actor.id:
        if data["role_id"] != target.role_id:
            raise _field_error("role_id", "You can't change your own role")
        if data["status"] != target.status:
            raise _field_error("status", "You can't change your own status")

    if payload.password:
        check_password(db, payload.password, payload.password_confirmation)
    return data


def _sync_permissions(db: Session, user: User, permission_ids: list[int], actor: User) -> bool:
    wanted = set(permission_ids)
    current = {up.permission_id: up for up in user.user_permissions}
    if wanted == set(current):
        return False
    if user.id == actor.id and not actor.is_super_admin:
        raise _field_error("permission_ids", "You can't change your own permissions")
    added = wanted - set(current)
    if added:
        found = db.query(Permission).filter(Permission.id.in_(added)).all()
        if len(found) != len(added):
            raise _field_error("permission_ids", "One or more permissions do not exist")
        if not actor.is_super_admin:
            held = set(actor.permission_names())
            missing = sorted(p.name for p in found if p.name not in held)
            if missing:
                raise _field_error("permission_ids", f"You can't grant permissions you don't have: {', '.join(missing)}")
    for pid, link in current.items():
        if pid not in wanted:
            user.user_permissions.remove(link)
    for pid in wanted - set(current):
        user.user_permissions.append(UserPermission(permission_id=pid))
    return True


def _grid_fields() -> dict[str, GridField]:
    current = now()
    online = (
        select(UserSession.id)
        .where(UserSession.user_id == User.id, UserSession.revoked_at.is_(None),
               UserSession.last_active_at >= current - ONLINE_WINDOW)
        .correlate(User)
        .exists()
    )
    return {
        "name": GridField(User.name, "text"),
        "email": GridField(User.email, "text"),
        "phone": GridField(User.phone, "text"),
        "role": GridField(User.role_id, "enum", cast=int),
        "status": GridField(User.status, "enum"),
        "two_factor": GridField(User.two_factor_confirmed_at.isnot(None), "bool", sortable=False),
        "locked": GridField(and_(User.locked_until.isnot(None), User.locked_until > current), "bool",
                            sortable=False),
        "online": GridField(online, "bool", sortable=False),
        "failed_logins": GridField(User.failed_logins, "number"),
        "last_login_at": GridField(User.last_login_at, "date"),
        "created_at": GridField(User.created_at, "date"),
    }


def list_users(db: Session, page=None, per_page=None, search=None, status=None,
               role_id: str | None = None, locked: bool | None = None,
               filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = _base_query(db)
    clause = search_clause([User.name, User.email, User.phone], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(User.status == status)
    if role_id:
        if role_id == "none":
            q = q.filter(User.role_id.is_(None))
        elif role_id.isdigit():
            q = q.filter(User.role_id == int(role_id))
        else:
            raise HTTPException(status_code=422, detail={"errors": {"role_id": ["Role id must be a number or 'none'"]}})
    if locked is True:
        q = q.filter(User.locked_until.isnot(None), User.locked_until > now())
    elif locked is False:
        q = q.filter((User.locked_until.is_(None)) | (User.locked_until <= now()))
    fields = _grid_fields()
    q = apply_filters(q, fields, filters, match)
    q = apply_sort(q, fields, sort, [User.id.desc()])
    return list_response(q, lambda r: _serialize(r[0], r[1]), page, per_page, search)


def stats(db: Session):
    current = now()
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(User.id)).filter(User.not_deleted(), *filters).scalar() or 0

    online = (
        db.query(func.count(func.distinct(UserSession.user_id)))
        .join(User, User.id == UserSession.user_id)
        .filter(User.not_deleted(), UserSession.revoked_at.is_(None),
                UserSession.last_active_at >= current - ONLINE_WINDOW)
        .scalar()
        or 0
    )
    return {
        "status": True,
        "data": {
            "total": count(),
            "active": count(User.status == Status.ACTIVE.value),
            "inactive": count(User.status == Status.INACTIVE.value),
            "locked": count(User.locked_until.isnot(None), User.locked_until > current),
            "two_factor": count(User.two_factor_confirmed_at.isnot(None)),
            "online": online,
            "no_role": count(User.role_id.is_(None)),
            "never_logged_in": count(User.last_login_at.is_(None)),
            "this_week": count(User.created_at >= week_start),
            "last_week": count(User.created_at >= week_start - timedelta(days=7), User.created_at < week_start),
        },
    }


def get_user(db: Session, user_id: int):
    return {"status": True, "data": _detail(db, user_id)}


def create_user(db: Session, payload: UserCreateSchema, request: Request):
    actor = _actor(request)
    data = _prepare(db, payload, actor)
    user = User(**data, password=hash_password(payload.password))
    db.add(user)
    db.flush()
    _sync_permissions(db, user, payload.permission_ids, actor)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, new_values=_snapshot(user))
    db.commit()
    return {"status": True, "message": "User created", "data": _detail(db, user.id)}


def update_user(db: Session, user_id: int, payload: UserUpdateSchema, request: Request):
    actor = _actor(request)
    user = _get_or_404(db, user_id)
    _guard_target(actor, user)
    before = _snapshot(user)
    data = _prepare(db, payload, actor, target=user)

    role_changed = data["role_id"] != user.role_id
    for key, value in data.items():
        setattr(user, key, value)
    perms_changed = _sync_permissions(db, user, payload.permission_ids, actor)
    if payload.password:
        user.password = hash_password(payload.password)
    if payload.password or role_changed or perms_changed:
        user.token_version += 1
    db.flush()

    old, new = diff(before, _snapshot(user))
    if payload.password:
        new["password"] = "changed"
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "User updated", "data": _detail(db, user.id)}


def toggle_status(db: Session, user_id: int, request: Request):
    actor = _actor(request)
    user = _get_or_404(db, user_id)
    _guard_target(actor, user)
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="You can't change your own status")
    before = user.status
    user.status = Status.INACTIVE.value if user.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, old_values={"status": before}, new_values={"status": user.status})
    db.commit()
    return {"status": True, "message": f"User {user.status}", "data": _detail(db, user.id)}


def delete_user(db: Session, user_id: int, request: Request):
    actor = _actor(request)
    user = _get_or_404(db, user_id)
    _guard_target(actor, user)
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user.deleted_at = now()
    _revoke_sessions(db, user.id)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description="Moved to trash", old_values=_snapshot(user))
    db.commit()
    return {"status": True, "message": "User moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    actor = _actor(request)
    rows = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id.in_(payload.ids), User.not_deleted(), User.id != actor.id)
        .all()
    )
    rows = [r for r in rows if not r.is_super_admin and not _outranks(actor, r)]
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    for row in rows:
        if payload.action == "delete":
            row.deleted_at = now()
            _revoke_sessions(db, row.id)
        else:
            row.status = Status.ACTIVE.value if payload.action == "activate" else Status.INACTIVE.value
    skipped = len(set(payload.ids)) - len(rows)
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: r.email,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    message = f"{len(rows)} users updated"
    if skipped:
        message += f" ({skipped} skipped: your own account, super admins, users with more access or missing)"
    return {"status": True, "message": message}


def unlock(db: Session, user_id: int, request: Request):
    user = _get_or_404(db, user_id)
    _guard_target(_actor(request), user)
    user.failed_logins = 0
    user.locked_until = None
    log_activity(db, "unlocked", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description="Account unlocked")
    db.commit()
    return {"status": True, "message": "Account unlocked", "data": _detail(db, user.id)}


def reset_two_factor(db: Session, user_id: int, request: Request):
    user = _get_or_404(db, user_id)
    _guard_target(_actor(request), user)
    if not user.two_factor_secret and not user.two_factor_confirmed_at:
        raise HTTPException(status_code=400, detail="Two-factor sign-in is not enabled for this user")
    user.two_factor_secret = None
    user.two_factor_recovery_codes = None
    user.two_factor_confirmed_at = None
    user.token_version += 1
    log_activity(db, "two_factor_reset", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description="Two-factor sign-in reset by an administrator")
    db.commit()
    actor = getattr(request.state, "user", None)
    send_template(db, "two_factor_reset", user.email, {
        "name": user.name, "email": user.email, "done_by": getattr(actor, "name", None),
        **device_variables(request),
    })
    return {"status": True, "message": "Two-factor sign-in reset", "data": _detail(db, user.id)}


def revoke_session(db: Session, user_id: int, session_id: str, request: Request):
    user = _get_or_404(db, user_id)
    _guard_target(_actor(request), user)
    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.revoked_at = now()
    log_activity(db, "session_revoked", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description=f"Ended session from {session.ip_address or 'unknown IP'}")
    db.commit()
    return {"status": True, "message": "Session ended"}


def revoke_all_sessions(db: Session, user_id: int, request: Request):
    user = _get_or_404(db, user_id)
    _guard_target(_actor(request), user)
    count = _revoke_sessions(db, user.id)
    log_activity(db, "sessions_revoked", request=request, subject_type=SUBJECT, subject_id=user.id,
                 subject_label=user.email, description=f"Ended {count} session(s)")
    db.commit()
    return {"status": True, "message": f"{count} session(s) ended"}
