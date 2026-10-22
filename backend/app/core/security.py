import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

ACCESS = "access"
REFRESH = "refresh"
TWO_FACTOR = "two_factor"


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        return False


def _encode(data: dict, token_type: str, expires: timedelta) -> str:
    payload = dict(data)
    payload.update(
        {
            "type": token_type,
            "exp": datetime.now(timezone.utc) + expires,
            "iat": datetime.now(timezone.utc),
        }
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(data: dict, minutes: int) -> str:
    return _encode(data, ACCESS, timedelta(minutes=minutes))


def create_refresh_token(data: dict, days: int) -> str:
    return _encode({**data, "jti": secrets.token_urlsafe(16)}, REFRESH, timedelta(days=days))


def create_two_factor_token(user_id: int, remember: bool) -> str:
    return _encode({"sub": str(user_id), "remember": remember}, TWO_FACTOR, timedelta(minutes=10))


def decode_token(token: str, expected_type: str | None = None) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None
    if expected_type and payload.get("type") != expected_type:
        return None
    return payload


def random_token(length: int = 48) -> str:
    return secrets.token_urlsafe(length)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
