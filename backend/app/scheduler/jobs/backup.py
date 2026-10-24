from sqlalchemy import text
from sqlalchemy.orm import Session

NAME = "backup"
DESCRIPTION = "Makes the automatic backup when it's due (times are set on the admin Backups page)."
CADENCE = "every minute (works only when a backup is due)"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.core.database import engine
    from app.modules.admin.activity_log.service import log_activity
    from app.modules.admin.backups import runner, schedule
    from app.modules.admin.backups.models import Backup

    lock = engine.connect()
    if not lock.execute(text("select pg_try_advisory_lock(:k)"), {"k": runner.BACKUP_LOCK}).scalar():
        lock.close()
        return "skipped: another scheduler process is busy with a backup"
    try:
        running = db.query(Backup).filter(Backup.status == runner.RUNNING).order_by(Backup.id.desc()).first()
        if running and not runner.is_stalled(running):
            return f"skipped: {running.name} is still running"
        if not force and not schedule.is_due(db):
            nxt = schedule.next_run(db)
            return f"not due (next: {nxt:%Y-%m-%d %H:%M})" if nxt else "automatic backups are off"

        s = schedule.get_settings(db)
        backup = runner.start(db, "scheduled", bool(s["include_database"]), bool(s["include_files"]))
        log_activity(db, "created", subject_type="backup", subject_id=backup.id, subject_label=backup.name,
                     description="Scheduled backup started" + (" (forced)" if force else ""))
        db.commit()
        backup_id, name = backup.id, backup.name
        status = runner.run(backup_id)
        db.expire_all()
        done = db.get(Backup, backup_id)
        if status == runner.COMPLETED:
            return f"{name} completed ({done.size} bytes)"
        return f"{name} FAILED: {(done.error or '')[:200]}"
    finally:
        lock.execute(text("select pg_advisory_unlock(:k)"), {"k": runner.BACKUP_LOCK})
        lock.close()
