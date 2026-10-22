from app.core.database import SessionLocal
from app.core.security import hash_password
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role
from app.modules.admin.users.models import User
from app.shared.enums import Status

DEFAULT_PASSWORD = "Password@123"

USERS = [
    ("superadmin@gmail.com", "Super Admin", SUPER_ADMIN_ROLE),
    ("admin@gmail.com", "Admin User", "admin"),
    ("editor@gmail.com", "Editor User", "editor"),
]


def run() -> None:
    db = SessionLocal()
    try:
        for email, name, role_name in USERS:
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                raise RuntimeError(f"Role '{role_name}' not found. Run `python seed.py rbac` first.")
            user = db.query(User).filter(User.email == email).first()
            if user:
                print(f"  exists: {email}")
                continue
            db.add(User(
                name=name,
                email=email,
                password=hash_password(DEFAULT_PASSWORD),
                role_id=role.id,
                status=Status.ACTIVE.value,
            ))
            print(f"  created: {email} / {DEFAULT_PASSWORD}")
        db.commit()
    finally:
        db.close()
