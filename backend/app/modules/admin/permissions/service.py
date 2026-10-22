import re
from itertools import groupby

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.permissions.models import Permission
from app.modules.admin.permissions.schemas import PermissionCreateSchema
from app.modules.admin.roles.models import RolePermission
from app.modules.admin.users.permission_model import UserPermission
from app.shared.constants import permissions as P
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso
from app.shared.utils.search import search_clause

SUBJECT = "permission"
_NAME = re.compile(r"^[a-z_]+\.[a-z_]+$")


def group_for(name: str) -> str:
    prefix = name.split(".", 1)[0]
    return P.PERMISSION_GROUPS.get(prefix, prefix.replace("_", " ").capitalize())


def _serialize(row: Permission, roles_count: int | None = None) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "group": row.group or group_for(row.name),
        "description": row.description,
        "roles_count": roles_count,
        "is_builtin": row.name in P.ALL_PERMISSIONS,
        "created_at": iso(row.created_at),
    }


def _base_query(db: Session):
    counts = (
        db.query(RolePermission.permission_id, func.count(RolePermission.id).label("total"))
        .group_by(RolePermission.permission_id)
        .subquery()
    )
    return (
        db.query(Permission, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.permission_id == Permission.id)
        .order_by(Permission.group, Permission.name)
    )


def _get_or_404(db: Session, permission_id: int) -> Permission:
    row = db.query(Permission).filter(Permission.id == permission_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Permission not found")
    return row


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def list_permissions(db: Session, page=None, per_page=None, search=None, group=None):
    q = _base_query(db)
    clause = search_clause([Permission.name, Permission.group, Permission.description], search)
    if clause is not None:
        q = q.filter(clause)
    if group:
        q = q.filter(Permission.group == group)
    return list_response(q, lambda r: _serialize(r[0], r[1]), page, per_page, search)


def grouped(db: Session):
    rows = [_serialize(p, c) for p, c in _base_query(db).all()]
    rows.sort(key=lambda r: (r["group"], r["name"]))
    data = [{"group": g, "permissions": list(items)} for g, items in groupby(rows, key=lambda r: r["group"])]
    return {"status": True, "data": data}


def create_permission(db: Session, payload: PermissionCreateSchema, request: Request):
    name = payload.name.strip().lower()
    if not _NAME.match(name):
        raise _field_error("name", "Use the format resource.action (lowercase letters and underscores)")
    if db.query(db.query(Permission.id).filter(Permission.name == name).exists()).scalar():
        raise _field_error("name", "This permission already exists")
    row = Permission(
        name=name,
        group=(payload.group or "").strip() or group_for(name),
        description=(payload.description or "").strip() or None,
    )
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name, new_values={"name": row.name, "group": row.group,
                                                     "description": row.description})
    db.commit()
    return {"status": True, "message": "Permission created", "data": _serialize(row, 0)}


def delete_permission(db: Session, permission_id: int, request: Request):
    row = _get_or_404(db, permission_id)
    if row.name in P.ALL_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Built-in permissions are used by the code and can't be deleted")
    roles = db.query(func.count(RolePermission.id)).filter(RolePermission.permission_id == row.id).scalar()
    users = db.query(func.count(UserPermission.id)).filter(UserPermission.permission_id == row.id).scalar()
    if roles or users:
        raise HTTPException(
            status_code=400,
            detail=f"This permission is in use by {roles} role(s) and {users} user(s). Remove it from them first.",
        )
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.name)
    db.delete(row)
    db.commit()
    return {"status": True, "message": "Permission deleted"}
