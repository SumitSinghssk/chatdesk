from datetime import timedelta

from sqlalchemy.orm import Session

from app.shared.utils.datetime import now

NAME = "trash"
DESCRIPTION = "Permanently deletes items that have been in the admin trash for 30 days."
CADENCE = "hourly"
SCHEDULE = "0 * * * *"
TRASH_DAYS = 30


def run(db: Session, force: bool = False) -> str:
    from app.modules.admin.trash import service as trash

    cutoff = now() - timedelta(days=TRASH_DAYS)
    counts = []
    for key, entry in trash.REGISTRY.items():
        model = entry.model
        rows = db.query(model).filter(model.deleted_at.is_not(None), model.deleted_at < cutoff).all()
        if rows:
            counts.append(f"{trash._purge(db, key, rows, None)} {key}")
    return f"purged {', '.join(counts)}" if counts else f"nothing older than {TRASH_DAYS} days"
