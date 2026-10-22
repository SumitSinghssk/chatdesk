from sqlalchemy.orm import Session

from app.modules.admin.not_found.models import NotFoundLog
from app.modules.admin.redirects.models import Redirect
from app.shared.enums import Status
from app.shared.utils.datetime import now
from app.shared.utils.slug import normalize_path

IGNORED_PREFIXES = ("/admin", "/api", "/_next", "/storage")
IGNORED_EXTENSIONS = (
    ".js", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
    ".woff", ".woff2", ".ttf", ".txt", ".xml", ".json", ".php", ".env",
)


def active_redirects(db: Session):
    rows = (
        db.query(Redirect.source_path, Redirect.target_url, Redirect.status_code)
        .filter(Redirect.status == Status.ACTIVE.value)
        .all()
    )
    return {"status": True, "data": [
        {"source_path": s, "target_url": t, "status_code": c} for s, t, c in rows
    ]}


def record_hit(db: Session, source_path: str):
    path = normalize_path(source_path)
    db.query(Redirect).filter(Redirect.source_path == path).update(
        {Redirect.hits: Redirect.hits + 1, Redirect.last_hit_at: now()}, synchronize_session=False
    )
    db.commit()
    return {"status": True}


def record_not_found(db: Session, path: str, referrer: str | None, user_agent: str | None):
    clean = normalize_path(path.split("?", 1)[0].split("#", 1)[0])[:500]
    lowered = clean.lower()
    if lowered.startswith(IGNORED_PREFIXES) or lowered.endswith(IGNORED_EXTENSIONS):
        return {"status": True}

    row = db.query(NotFoundLog).filter(NotFoundLog.path == clean).first()
    if row:
        row.hits += 1
        row.last_seen_at = now()
        row.last_referrer = (referrer or row.last_referrer or "")[:1000] or None
        row.last_user_agent = (user_agent or "")[:500] or None
    else:
        db.add(NotFoundLog(
            path=clean,
            last_referrer=(referrer or "")[:1000] or None,
            last_user_agent=(user_agent or "")[:500] or None,
        ))
    db.commit()
    return {"status": True}
