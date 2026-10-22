from app.core.database import SessionLocal
from app.modules.admin.permissions.models import Permission
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role, RolePermission
from app.shared.constants import permissions as P

ROLES = [
    (SUPER_ADMIN_ROLE, "Full access to everything. System role.", True),
    ("admin", "Manages content, users and settings.", False),
    ("editor", "Writes and publishes website content.", False),
    ("sales", "Handles enquiries.", False),
]


def _group(name: str) -> str:
    return P.PERMISSION_GROUPS.get(name.split(".", 1)[0], name.split(".", 1)[0].replace("_", " ").title())


def run() -> None:
    db = SessionLocal()
    try:
        existing = {p.name: p for p in db.query(Permission).all()}
        added: set[str] = set()
        for name in P.ALL_PERMISSIONS:
            if name not in existing:
                perm = Permission(name=name, group=_group(name))
                db.add(perm)
                existing[name] = perm
                added.add(name)
        db.flush()
        print(f"  permissions: {len(P.ALL_PERMISSIONS)}")

        for name, description, is_system in ROLES:
            role = db.query(Role).filter(Role.name == name).first()
            created = role is None
            if created:
                role = Role(name=name, description=description, is_system=is_system)
                db.add(role)
                db.flush()
            grant = set(P.ROLE_DEFAULTS.get(name, [])) if created else added & set(P.ROLE_DEFAULTS.get(name, []))
            for perm_name in grant:
                db.add(RolePermission(role_id=role.id, permission_id=existing[perm_name].id))
            print(f"  role: {name}{' (created)' if created else ''}")
        db.commit()
    finally:
        db.close()
