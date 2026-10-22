import re

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.permissions.models import Permission
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role, RolePermission
from app.modules.admin.roles.schemas import RoleCreateSchema, RoleUpdateSchema, TogglePermissionSchema
from app.modules.admin.users.models import User
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SUBJECT = "role"
_NAME_CHARS = re.compile(r"^[A-Za-z0-9_ ]+$")
_SEPARATORS = re.compile(r"[\s_]+")


def _serialize(row: Role, users_count: int | None = None) -> dict:
    perms = sorted(row.permissions or [], key=lambda p: p.name)
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "is_system": row.is_system,
        "requires_two_factor": row.requires_two_factor,
        "permissions": [p.name for p in perms],
        "permission_ids": [p.id for p in perms],
        "users_count": users_count,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: Role) -> dict:
    return {"name": row.name, "description": row.description, "requires_two_factor": row.requires_two_factor,
            "permission_ids": sorted(rp.permission_id for rp in row.role_permissions)}


def _users_count(db: Session, role_id: int) -> int:
    return db.query(func.count(User.id)).filter(User.role_id == role_id, User.not_deleted()).scalar() or 0


def _get_or_404(db: Session, role_id: int) -> Role:
    row = (
        db.query(Role)
        .options(selectinload(Role.permissions), selectinload(Role.role_permissions))
        .filter(Role.id == role_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Role not found")
    return row


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _normalize_name(db: Session, raw: str, exclude_id: int | None = None) -> str:
    if not _NAME_CHARS.match(raw.strip()):
        raise _field_error("name", "Use letters, numbers, spaces or underscores only")
    name = _SEPARATORS.sub("_", raw.strip().lower()).strip("_")
    if len(name) < 2:
        raise _field_error("name", "Name must be at least 2 characters")
    if name == SUPER_ADMIN_ROLE:
        raise _field_error("name", "This role name is reserved")
    q = db.query(Role.id).filter(Role.name == name)
    if exclude_id is not None:
        q = q.filter(Role.id != exclude_id)
    if db.query(q.exists()).scalar():
        raise _field_error("name", "A role with this name already exists")
    return name


def _validate_permission_ids(db: Session, ids: list[int]) -> set[int]:
    wanted = set(ids)
    if wanted:
        found = db.query(func.count(Permission.id)).filter(Permission.id.in_(wanted)).scalar()
        if found != len(wanted):
            raise _field_error("permission_ids", "One or more permissions do not exist")
    return wanted


def _held(request: Request) -> set[str]:
    return set(getattr(request.state, "perms", None) or get_current_user(request).permission_names())


def _guard_escalation(db: Session, request: Request, row: Role | None, wanted: set[int]) -> None:
    actor = get_current_user(request)
    held = _held(request)
    if actor.is_super_admin or "*" in held:
        return
    if row is not None:
        if row.id == actor.role_id:
            raise HTTPException(status_code=403, detail="You can't change your own role")
        if any(p.name not in held for p in row.permissions or []):
            raise HTTPException(status_code=403, detail="You can't change a role that has permissions you don't have")
    if wanted:
        names = [n for (n,) in db.query(Permission.name).filter(Permission.id.in_(wanted)).all()]
        missing = sorted(n for n in names if n not in held)
        if missing:
            raise _field_error("permission_ids", f"You can't grant permissions you don't have: {', '.join(missing)}")


def _sync_permissions(row: Role, wanted: set[int]) -> bool:
    current = {rp.permission_id: rp for rp in row.role_permissions}
    if wanted == set(current):
        return False
    for pid, link in current.items():
        if pid not in wanted:
            row.role_permissions.remove(link)
    for pid in wanted - set(current):
        row.role_permissions.append(RolePermission(permission_id=pid))
    return True


def _sign_out_members(db: Session, role_id: int) -> None:
    db.query(User).filter(User.role_id == role_id).update(
        {User.token_version: User.token_version + 1}, synchronize_session=False
    )


def _detail(db: Session, role_id: int) -> dict:
    row = _get_or_404(db, role_id)
    return _serialize(row, _users_count(db, row.id))


def list_roles(db: Session, page=None, per_page=None, search=None,
               filters: str | None = None, match: str | None = "and", sort: str | None = None):
    counts = (
        db.query(User.role_id, func.count(User.id).label("total"))
        .filter(User.not_deleted(), User.role_id.isnot(None))
        .group_by(User.role_id)
        .subquery()
    )
    perm_counts = (
        db.query(RolePermission.role_id, func.count(RolePermission.id).label("total"))
        .group_by(RolePermission.role_id)
        .subquery()
    )
    users_count = func.coalesce(counts.c.total, 0)
    q = (
        db.query(Role, users_count)
        .outerjoin(counts, counts.c.role_id == Role.id)
        .outerjoin(perm_counts, perm_counts.c.role_id == Role.id)
        .options(selectinload(Role.permissions))
    )
    clause = search_clause([Role.name, Role.description], search)
    if clause is not None:
        q = q.filter(clause)
    fields = {
        "name": GridField(Role.name, "text"),
        "description": GridField(Role.description, "text"),
        "permissions": GridField(func.coalesce(perm_counts.c.total, 0), "number"),
        "users": GridField(users_count, "number"),
        "requires_two_factor": GridField(Role.requires_two_factor, "bool"),
        "is_system": GridField(Role.is_system, "bool"),
        "created_at": GridField(Role.created_at, "date"),
        "updated_at": GridField(Role.updated_at, "date"),
    }
    q = apply_filters(q, fields, filters, match)
    q = apply_sort(q, fields, sort, [Role.is_system.desc(), Role.name])
    return list_response(q, lambda r: _serialize(r[0], r[1]), page, per_page, search)


def get_role(db: Session, role_id: int):
    row = _get_or_404(db, role_id)
    return {"status": True, "data": _serialize(row, _users_count(db, row.id))}


def create_role(db: Session, payload: RoleCreateSchema, request: Request):
    row = Role(
        name=_normalize_name(db, payload.name),
        description=(payload.description or "").strip() or None,
        requires_two_factor=payload.requires_two_factor,
        is_system=False,
    )
    wanted = _validate_permission_ids(db, payload.permission_ids)
    _guard_escalation(db, request, None, wanted)
    db.add(row)
    db.flush()
    _sync_permissions(row, wanted)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Role created", "data": _detail(db, row.id)}


def update_role(db: Session, role_id: int, payload: RoleUpdateSchema, request: Request):
    row = _get_or_404(db, role_id)
    before = _snapshot(row)
    wanted = _validate_permission_ids(db, payload.permission_ids)
    _guard_escalation(db, request, row, wanted)

    if row.is_system:
        if _SEPARATORS.sub("_", payload.name.strip().lower()) != row.name:
            raise _field_error("name", "A system role can't be renamed")
        if wanted and wanted != {rp.permission_id for rp in row.role_permissions}:
            raise _field_error("permission_ids", "A system role's permissions can't be changed")
    else:
        row.name = _normalize_name(db, payload.name, exclude_id=row.id)
        if _sync_permissions(row, wanted):
            _sign_out_members(db, row.id)
    row.description = (payload.description or "").strip() or None
    row.requires_two_factor = payload.requires_two_factor
    db.flush()

    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Role updated", "data": _detail(db, row.id)}


def toggle_permission(db: Session, role_id: int, payload: TogglePermissionSchema, request: Request):
    row = _get_or_404(db, role_id)
    if row.is_system:
        raise HTTPException(status_code=400, detail="A system role's permissions can't be changed")
    perm = db.query(Permission).filter(Permission.id == payload.permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    _guard_escalation(db, request, row, {perm.id})

    link = next((rp for rp in row.role_permissions if rp.permission_id == perm.id), None)
    if link:
        row.role_permissions.remove(link)
    else:
        row.role_permissions.append(RolePermission(permission_id=perm.id))
    attached = link is None
    _sign_out_members(db, row.id)
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name,
                 description=f"{'Granted' if attached else 'Revoked'} {perm.name}",
                 new_values={"permission": perm.name, "granted": attached})
    db.commit()
    return {
        "status": True,
        "message": f"Permission {'granted' if attached else 'revoked'}",
        "data": {"permission_id": perm.id, "attached": attached, "role": _detail(db, row.id)},
    }


def delete_role(db: Session, role_id: int, request: Request):
    row = _get_or_404(db, role_id)
    if row.is_system:
        raise HTTPException(status_code=400, detail="System roles can't be deleted")
    users = _users_count(db, row.id)
    if users:
        raise HTTPException(status_code=400,
                            detail=f"This role is assigned to {users} user(s). Reassign them before deleting it.")
    label = row.name
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=label, old_values=_snapshot(row))
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Role deleted"}
