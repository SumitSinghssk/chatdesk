import re

_NON_SLUG = re.compile(r"[^a-z0-9-]+")
_DASHES = re.compile(r"-{2,}")


def normalize_slug(value: str | None) -> str:
    slug = _NON_SLUG.sub("-", (value or "").strip().lower())
    return _DASHES.sub("-", slug).strip("-")


def normalize_path(value: str | None) -> str:
    path = (value or "").strip()
    if not path:
        return "/"
    if path.startswith(("http://", "https://")):
        return path
    path = "/" + path.lstrip("/")
    if len(path) > 1:
        path = path.rstrip("/")
    return path
