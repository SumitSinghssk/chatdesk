import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STORAGE_DIR = PROJECT_ROOT / "storage"


def _resolve_database_url() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to your .env, e.g.:\n"
            "  DATABASE_URL=postgresql://user:password@localhost:5432/dbname"
        )
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+psycopg2://" + url[len(prefix):]
    return url


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(key: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(key, default).split(",") if item.strip()]


class Settings:
    APP_ENV = os.getenv("APP_ENV", "development")
    APP_URL = os.getenv("APP_URL", "http://127.0.0.1:8000")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
    DEBUG = _env_bool("DEBUG", APP_ENV != "production")
    SQL_ECHO = _env_bool("SQL_ECHO", False)

    ALLOWED_ORIGINS = _env_list(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    )
    TRUSTED_PROXIES = _env_list("TRUSTED_PROXIES", "127.0.0.1,::1")

    DATABASE_URL = _resolve_database_url()

    SECRET_KEY = os.getenv("SECRET_KEY") or "change-me-in-env"
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    ADMIN_HINT_SECRET = os.getenv("ADMIN_HINT_SECRET", "")

    RATE_LIMIT_BACKEND = os.getenv("RATE_LIMIT_BACKEND", "db").strip().lower()
    INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()
    UPLOADS_PUBLIC_URL = os.getenv("UPLOADS_PUBLIC_URL", "").strip().rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


DEFAULT_SECRET_KEY = "change-me-in-env"
DEFAULT_APP_NAME = "ChatDesk"


def _check_production_secret(s: Settings) -> None:
    if not s.is_production:
        return
    key = os.getenv("SECRET_KEY") or ""
    if not key or key == DEFAULT_SECRET_KEY or len(key) < 32:
        raise RuntimeError(
            "SECRET_KEY must be set to a random value of at least 32 characters when APP_ENV=production. "
            'Generate one with: python -c "import secrets;print(secrets.token_urlsafe(48))"'
        )


settings = Settings()
_check_production_secret(settings)
