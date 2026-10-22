import logging
import os

from app.core.config import settings

logger = logging.getLogger(__name__)

_enabled = False


def _rate(key: str, default: float) -> float:
    try:
        return max(0.0, min(1.0, float(os.getenv(key, default))))
    except ValueError:
        return default


def _scrub(event, hint):
    request = event.get("request") or {}
    headers = request.get("headers") or {}
    for name in list(headers):
        if name.lower() in {"authorization", "cookie", "x-internal-key"}:
            headers[name] = "[Filtered]"
    request.pop("cookies", None)
    return event


def init_sentry(component: str) -> bool:
    global _enabled
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn or _enabled:
        return _enabled
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; error monitoring is off.")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT") or settings.APP_ENV,
        release=os.getenv("SENTRY_RELEASE") or None,
        traces_sample_rate=_rate("SENTRY_TRACES_SAMPLE_RATE", 0.0),
        send_default_pii=False,
        before_send=_scrub,
    )
    sentry_sdk.set_tag("component", component)
    _enabled = True
    return True


def capture_exception(exc: BaseException) -> None:
    if not _enabled:
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)
