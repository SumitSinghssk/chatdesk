import hashlib
import hmac
from datetime import datetime

from fastapi import HTTPException, Request, Response

from app.core.config import settings
from app.shared.utils.datetime import UTC, now

REFRESH_COOKIE = "sk_refresh"
REFRESH_COOKIE_PATH = "/api/v1/admin/auth"
HINT_COOKIE = "sk_admin"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "sk-admin"


def require_csrf_header(request: Request) -> None:
    if request.headers.get(CSRF_HEADER, "").lower() != CSRF_VALUE:
        raise HTTPException(status_code=403, detail="Missing or invalid X-Requested-With header")


def read_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE) or None


def sign_hint(user_id: int, expires: int) -> str:
    message = f"{user_id}.{expires}"
    signature = hmac.new(settings.ADMIN_HINT_SECRET.encode("utf-8"), message.encode("utf-8"),
                         hashlib.sha256).hexdigest()
    return f"{message}.{signature}"


def set_session_cookies(response: Response, refresh_token: str, user_id: int, expires_at: datetime,
                        remember: bool) -> None:
    max_age = max(0, int((expires_at - now()).total_seconds())) if remember else None
    secure = settings.is_production
    response.set_cookie(
        REFRESH_COOKIE, refresh_token, max_age=max_age, path=REFRESH_COOKIE_PATH,
        httponly=True, secure=secure, samesite="strict",
    )
    if settings.ADMIN_HINT_SECRET:
        expires = int(expires_at.replace(tzinfo=UTC).timestamp())
        response.set_cookie(
            HINT_COOKIE, sign_hint(user_id, expires), max_age=max_age, path="/",
            httponly=True, secure=secure, samesite="lax",
        )


def clear_session_cookies(response: Response) -> None:
    secure = settings.is_production
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=secure,
                           samesite="strict")
    response.delete_cookie(HINT_COOKIE, path="/", httponly=True, secure=secure, samesite="lax")
