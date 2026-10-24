from sqlalchemy.orm import Session

NAME = "security"
DESCRIPTION = "Clears expired firewall blocks, old login attempts and old rate-limit windows."
CADENCE = "hourly"
SCHEDULE = "30 * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.core.rate_limiter import purge_expired
    from app.modules.admin.security.tasks import purge

    result = purge(db)
    db.commit()
    windows = purge_expired()
    if windows:
        result = f"{result + '; ' if result else ''}removed {windows} old rate-limit window{'s' if windows != 1 else ''}"
    return result or "nothing to do"
