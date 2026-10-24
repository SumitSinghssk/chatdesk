from datetime import timedelta

from sqlalchemy.orm import Session

from app.shared.utils.datetime import now

NAME = "not_found"
DESCRIPTION = "Removes 404-log entries not seen for 90 days."
CADENCE = "hourly"
SCHEDULE = "15 * * * *"
NOT_FOUND_DAYS = 90


def run(db: Session, force: bool = False) -> str:
    from app.modules.admin.not_found.models import NotFoundLog

    cutoff = now() - timedelta(days=NOT_FOUND_DAYS)
    count = db.query(NotFoundLog).filter(NotFoundLog.last_seen_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return f"removed {count} entr{'y' if count == 1 else 'ies'} not seen for {NOT_FOUND_DAYS} days"
