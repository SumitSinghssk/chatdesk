import hashlib
import hmac


def verify_signature(app_secret: str | None, body: bytes, header: str | None) -> bool:
    """Checks Meta's X-Hub-Signature-256 header against the app secret."""
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header[len("sha256="):], expected)
