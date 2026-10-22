from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.security import ACCESS, decode_token
from app.modules.admin.auth.models import UserSession
from app.modules.admin.roles.models import Role
from app.modules.admin.users.models import User
from app.shared.enums import Status
from app.shared.utils.datetime import now

bearer_scheme = HTTPBearer(
    bearerFormat="JWT",
    description="Paste the raw access token (Swagger adds the `Bearer ` prefix).",
    auto_error=False,
)

_TOUCH_INTERVAL = timedelta(minutes=1)
_TWO_FACTOR_SETUP_PATHS = ("/auth/", "/profile")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def load_user(db: Session, user_id: int) -> User | None:
    return (
        db.query(User)
        .options(
            joinedload(User.role).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
        .filter(User.id == user_id, User.not_deleted())
        .first()
    )


def require_admin_auth(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> int:
    if creds is None or (creds.scheme or "").lower() != "bearer" or not creds.credentials:
        raise _unauthorized("Missing or invalid authorization header")

    payload = decode_token(creds.credentials.strip(), ACCESS)
    if not payload:
        raise _unauthorized("Authentication token is invalid or has expired")

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise _unauthorized("Authentication token is malformed")

    session = db.query(UserSession).filter(UserSession.id == payload.get("sid")).first()
    if not session or session.revoked_at is not None or session.user_id != user_id:
        raise _unauthorized("Your session has ended. Please log in again.")

    user = load_user(db, user_id)
    if not user:
        raise _unauthorized("The authenticated user no longer exists")
    if payload.get("token_version") != user.token_version:
        raise _unauthorized("Your session has ended because your account or access was changed. Please log in again.")
    if user.status != Status.ACTIVE.value:
        raise _unauthorized("Your account is not active")

    if user.role and user.role.requires_two_factor and not user.two_factor_enabled:
        path = request.url.path
        if not any(f"/admin{prefix}" in path for prefix in _TWO_FACTOR_SETUP_PATHS):
            raise HTTPException(
                status_code=403,
                detail={"message": "Your role requires two-factor sign-in. Set it up to continue.",
                        "code": "two_factor_setup_required"},
            )

    current = now()
    if current - session.last_active_at > _TOUCH_INTERVAL:
        session.last_active_at = current
        db.commit()

    request.state.user_id = user.id
    request.state.user = user
    request.state.session_id = session.id
    request.state.perms = set(user.permission_names())
    return user.id


def require_admin_permission(*required: str):
    if not required:
        raise ValueError("require_admin_permission(...) needs at least one permission key")

    def _check(request: Request, user_id: int = Depends(require_admin_auth)):
        perms = getattr(request.state, "perms", None) or set()
        if "*" in perms or any(key in perms for key in required):
            return user_id
        raise HTTPException(status_code=403, detail=f"Missing permission: {' or '.join(required)}")

    return _check
