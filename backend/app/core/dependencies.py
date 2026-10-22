from fastapi import HTTPException, Request

from app.modules.admin.users.models import User


def get_current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_session_id(request: Request) -> str:
    sid = getattr(request.state, "session_id", None)
    if not sid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sid


def has_permission(request: Request, key: str) -> bool:
    perms = getattr(request.state, "perms", None) or set()
    return "*" in perms or key in perms


def require_bulk_permission(request: Request, action: str, update_perm: str, delete_perm: str) -> None:
    needed = delete_perm if action == "delete" else update_perm
    if not has_permission(request, needed):
        raise HTTPException(status_code=403, detail=f"Missing permission: {needed}")
