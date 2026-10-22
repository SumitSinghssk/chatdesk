import argparse
import getpass
import secrets
import sys

from app import models  # noqa: F401
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.modules.admin.auth.models import UserSession
from app.modules.admin.blogs.models import Blog
from app.modules.admin.pages.models import Page
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role
from app.modules.admin.security import firewall
from app.modules.admin.security.tasks import purge
from app.modules.admin.users.models import User
from app.modules.website.whatsapp.service import replay_unprocessed
from app.shared.enums import Status
from app.shared.utils.datetime import now
from app.shared.utils.html import clean_html


def _user(db, email: str) -> User:
    user = db.query(User).filter(User.email == email.lower().strip(), User.not_deleted()).first()
    if not user:
        print(f"[x] No admin user with email {email}")
        sys.exit(1)
    return user


def _end_sessions(db, user: User) -> None:
    user.token_version += 1
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)) \
        .update({UserSession.revoked_at: now()}, synchronize_session=False)


def reset_password(email: str, generate: bool) -> None:
    db = SessionLocal()
    try:
        user = _user(db, email)
        if generate:
            password = secrets.token_urlsafe(12)
        else:
            password = getpass.getpass("New password (min 8 characters): ")
            if len(password) < 8 or password != getpass.getpass("Repeat password: "):
                print("[x] Passwords must match and be at least 8 characters")
                sys.exit(1)
        user.password = hash_password(password)
        user.failed_logins = 0
        user.locked_until = None
        _end_sessions(db, user)
        db.commit()
        print(f"[ok] Password updated for {user.email}; every session was signed out.")
        if generate:
            print(f"     New password: {password}")
    finally:
        db.close()


def create_admin(email: str, name: str, generate: bool) -> None:
    db = SessionLocal()
    try:
        email = email.lower().strip()
        if db.query(User).filter(User.email == email).first():
            print(f"[x] A user with email {email} already exists. Use reset-password instead.")
            sys.exit(1)
        role = db.query(Role).filter(Role.name == SUPER_ADMIN_ROLE).first()
        if not role:
            print("[x] The super admin role is missing. Run `python seed.py rbac` first.")
            sys.exit(1)
        if generate:
            password = secrets.token_urlsafe(12)
        else:
            password = getpass.getpass("Password (min 8 characters): ")
            if len(password) < 8 or password != getpass.getpass("Repeat password: "):
                print("[x] Passwords must match and be at least 8 characters")
                sys.exit(1)
        db.add(User(name=name, email=email, password=hash_password(password), role_id=role.id,
                    status=Status.ACTIVE.value))
        db.commit()
        print(f"[ok] Super admin {email} created.")
        if generate:
            print(f"     Password: {password}")
    finally:
        db.close()


def unlock(email: str) -> None:
    db = SessionLocal()
    try:
        user = _user(db, email)
        user.failed_logins = 0
        user.locked_until = None
        db.commit()
        print(f"[ok] {user.email} is unlocked.")
    finally:
        db.close()


def reset_two_factor(email: str) -> None:
    db = SessionLocal()
    try:
        user = _user(db, email)
        user.two_factor_secret = None
        user.two_factor_recovery_codes = None
        user.two_factor_confirmed_at = None
        _end_sessions(db, user)
        db.commit()
        print(f"[ok] Two-factor sign-in turned off for {user.email}; they can set it up again from My profile.")
    finally:
        db.close()


def unblock(ip: str) -> None:
    db = SessionLocal()
    try:
        removed = firewall.unblock_ip(db, ip)
        db.commit()
        print(f"[ok] Removed {removed} firewall rule(s) for {ip}." if removed else f"[ok] {ip} was not blocked.")
    finally:
        db.close()


def security_purge() -> None:
    db = SessionLocal()
    try:
        summary = purge(db)
        db.commit()
        print(f"[ok] {summary or 'Nothing to purge.'}")
    finally:
        db.close()


def sanitize_content() -> None:
    db = SessionLocal()
    try:
        changed = []
        for model in (Blog, Page):
            count = 0
            for row in db.query(model).filter(model.content.is_not(None)).yield_per(200):
                cleaned = clean_html(row.content)
                if cleaned != row.content:
                    row.content = cleaned
                    count += 1
            changed.append(f"{count} {model.__tablename__}")
        db.commit()
        print(f"[ok] Cleaned {', '.join(changed)}.")
    finally:
        db.close()


def replay_whatsapp() -> None:
    db = SessionLocal()
    try:
        count = replay_unprocessed(db)
        print(f"[ok] Processed {count} stored WhatsApp webhook event{'s' if count != 1 else ''}.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Starter kit admin commands")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("reset-password", help="Set a new password for an admin")
    p.add_argument("email")
    p.add_argument("--generate", action="store_true", help="Generate a random password and print it")
    c = sub.add_parser("create-admin", help="Create a super admin account")
    c.add_argument("email")
    c.add_argument("--name", default="Administrator")
    c.add_argument("--generate", action="store_true", help="Generate a random password and print it")
    sub.add_parser("unlock", help="Clear an account lockout").add_argument("email")
    sub.add_parser("reset-two-factor", help="Turn off two-factor sign-in").add_argument("email")
    sub.add_parser("unblock", help="Remove an IP or range from the firewall").add_argument("ip")
    sub.add_parser("security-purge", help="Delete old blocked requests and expired blocks")
    sub.add_parser("sanitize-content", help="Re-clean stored blog / page HTML")
    sub.add_parser("replay-whatsapp", help="Turn stored, unprocessed WhatsApp webhook events into messages")
    args = parser.parse_args()

    if args.command == "reset-password":
        reset_password(args.email, args.generate)
    elif args.command == "create-admin":
        create_admin(args.email, args.name, args.generate)
    elif args.command == "unlock":
        unlock(args.email)
    elif args.command == "reset-two-factor":
        reset_two_factor(args.email)
    elif args.command == "unblock":
        unblock(args.ip)
    elif args.command == "security-purge":
        security_purge()
    elif args.command == "sanitize-content":
        sanitize_content()
    elif args.command == "replay-whatsapp":
        replay_whatsapp()


if __name__ == "__main__":
    main()
