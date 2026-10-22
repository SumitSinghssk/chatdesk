import hmac
import io
import secrets
import time

import pyotp
import qrcode
import qrcode.image.svg

from app.core.crypto import decrypt_secret
from app.core.security import sha256

RECOVERY_CODE_COUNT = 8


def new_secret() -> str:
    return pyotp.random_base32()


def otpauth_uri(secret: str, email: str, issuer: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def qr_svg(data: str) -> str:
    image = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    buffer = io.BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode("utf-8")


def verify_code(encrypted_secret: str | None, code: str | None, last_step: int | None = None) -> int | None:
    secret = decrypt_secret(encrypted_secret)
    clean = (code or "").replace(" ", "").strip()
    if not secret or not clean.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    current = int(time.time()) // totp.interval
    for step in (current - 1, current, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(totp.generate_otp(step), clean):
            return step
    return None


def new_recovery_codes() -> tuple[list[str], list[str]]:
    plain = [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(RECOVERY_CODE_COUNT)]
    return plain, [sha256(c) for c in plain]


def consume_recovery_code(stored_hashes: list[str] | None, code: str | None) -> list[str] | None:
    hashed = sha256((code or "").strip().lower())
    hashes = list(stored_hashes or [])
    if hashed not in hashes:
        return None
    hashes.remove(hashed)
    return hashes
