from sqlalchemy.orm import Session

from app.modules.admin.security import firewall


def purge(db: Session) -> str | None:
    removed, expired = firewall.purge(db)
    if not removed and not expired:
        return None
    parts = []
    if removed:
        parts.append(f"{removed} old blocked request{'s' if removed != 1 else ''}")
    if expired:
        parts.append(f"{expired} expired IP block{'s' if expired != 1 else ''}")
    return "Removed " + " and ".join(parts)
