from datetime import timedelta

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.backups import runner, schedule
from app.modules.admin.backups.models import Backup
from app.modules.admin.backups.schemas import BackupCreateSchema, BackupSettingsSchema
from app.modules.admin.users.models import User
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SUBJECT = "backup"


def _serialize(row: Backup, user_name: str | None = None) -> dict:
    parts = row.parts or []
    stalled = runner.is_stalled(row)
    return {
        "id": row.id,
        "name": row.name,
        "trigger": row.trigger,
        "includes_database": row.includes_database,
        "includes_files": row.includes_files,
        "status": row.status,
        "stage": row.stage,
        "stalled": stalled,
        "note": row.stage if row.status == runner.COMPLETED and row.stage not in (None, "Completed") else None,
        "parts": parts,
        "downloads": [
            {"file": p["file"], "label": p.get("label") or p["file"], "size": p.get("size", 0),
             "url": f"/admin/backups/{row.id}/download/{p['file']}"}
            for p in parts
        ] if row.status == runner.COMPLETED else [],
        "size": row.size or 0,
        "error": row.error,
        "user": {"id": row.user_id, "name": user_name} if row.user_id else None,
        "started_at": iso(row.started_at),
        "finished_at": iso(row.finished_at),
        "duration_seconds": int((row.finished_at - row.started_at).total_seconds())
        if row.finished_at and row.started_at else None,
        "created_at": iso(row.created_at),
    }


def _get_or_404(db: Session, backup_id: int) -> tuple[Backup, str | None]:
    row = (
        db.query(Backup, User.name).outerjoin(User, User.id == Backup.user_id)
        .filter(Backup.id == backup_id).first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    return row[0], row[1]


GRID_FIELDS = {
    "name": GridField(Backup.name, "text"),
    "trigger": GridField(Backup.trigger, "enum"),
    "status": GridField(Backup.status, "enum"),
    "size": GridField(Backup.size, "number"),
    "includes_database": GridField(Backup.includes_database, "bool"),
    "includes_files": GridField(Backup.includes_files, "bool"),
    "user": GridField(User.name, "text"),
    "started_at": GridField(Backup.started_at, "date"),
    "finished_at": GridField(Backup.finished_at, "date"),
    "error": GridField(Backup.error, "text", sortable=False),
}


def _summary(db: Session) -> dict:
    running = db.query(Backup).filter(Backup.status == runner.RUNNING).order_by(Backup.id.desc()).first()
    return {
        "total_size": int(db.query(func.coalesce(func.sum(Backup.size), 0)).filter(Backup.status == runner.COMPLETED).scalar() or 0),
        "running_id": running.id if running and not runner.is_stalled(running) else None,
    }


def list_backups(db: Session, page=None, per_page=None, search=None, filters: str | None = None,
                 match: str | None = "and", sort: str | None = None):
    q = db.query(Backup, User.name).outerjoin(User, User.id == Backup.user_id)
    clause = search_clause([Backup.name, User.name], search)
    if clause is not None:
        q = q.filter(clause)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Backup.id.desc()])
    result = list_response(q, lambda r: _serialize(r[0], r[1]), page or 1, per_page or 15)
    result["summary"] = _summary(db)
    return result


def stats(db: Session):
    last_ok = (
        db.query(Backup).filter(Backup.status == runner.COMPLETED)
        .order_by(Backup.finished_at.desc().nulls_last(), Backup.id.desc()).first()
    )
    since = now() - timedelta(days=30)
    by_status = dict(db.query(Backup.status, func.count(Backup.id)).group_by(Backup.status).all())
    settings = schedule.get_settings(db)
    return {
        "status": True,
        "data": {
            **_summary(db),
            "total": sum(by_status.values()),
            "completed": by_status.get(runner.COMPLETED, 0),
            "failed": by_status.get(runner.FAILED, 0),
            "failed_30d": db.query(func.count(Backup.id)).filter(
                Backup.status == runner.FAILED, Backup.created_at >= since).scalar() or 0,
            "last_success": {"id": last_ok.id, "name": last_ok.name,
                             "finished_at": iso(last_ok.finished_at or last_ok.created_at),
                             "size": last_ok.size or 0} if last_ok else None,
            "schedule_enabled": bool(settings.get("enabled")),
            "schedule_description": schedule.describe(db, settings),
            "next_run_at": iso(schedule.next_run(db)),
        },
    }


def get_backup(db: Session, backup_id: int):
    row, user_name = _get_or_404(db, backup_id)
    return {"status": True, "data": _serialize(row, user_name)}


def create_backup(db: Session, payload: BackupCreateSchema, request: Request):
    user = getattr(request.state, "user", None)
    row = runner.start(db, "manual", payload.include_database, payload.include_files, user.id if user else None)
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id, subject_label=row.name,
                 description="Started a backup",
                 new_values={"include_database": payload.include_database, "include_files": payload.include_files})
    db.commit()
    runner.run_in_background(row.id)
    return {"status": True, "message": "Backup started", "data": _serialize(row, user.name if user else None)}


def delete_backup(db: Session, backup_id: int, request: Request):
    row, _ = _get_or_404(db, backup_id)
    if row.status == runner.RUNNING and not runner.is_stalled(row):
        raise HTTPException(status_code=409, detail="This backup is still running. Wait for it to finish first.")
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id, subject_label=row.name,
                 description="Deleted a backup")
    runner.delete_backup(db, row)
    db.commit()
    return {"status": True, "message": "Backup deleted"}


def bulk_delete(db: Session, ids: list[int], request: Request):
    rows = db.query(Backup).filter(Backup.id.in_(ids)).all()
    deleted, skipped = 0, 0
    for row in rows:
        if row.status == runner.RUNNING and not runner.is_stalled(row):
            skipped += 1
            continue
        log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=row.name, description="Deleted a backup")
        runner.delete_backup(db, row)
        deleted += 1
    db.commit()
    message = f"{deleted} backup(s) deleted" + (f", {skipped} still running" if skipped else "")
    return {"status": True, "message": message, "data": {"deleted": deleted, "skipped": skipped}}


def download(db: Session, backup_id: int, file: str, request: Request):
    row, _ = _get_or_404(db, backup_id)
    if row.status != runner.COMPLETED or file not in {p.get("file") for p in (row.parts or [])}:
        raise HTTPException(status_code=404, detail="That file isn't part of this backup")
    root = runner.BACKUP_DIR.resolve()
    path = (runner.directory(row) / file).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="The backup file is missing on the server")
    log_activity(db, "downloaded", request=request, subject_type=SUBJECT, subject_id=row.id, subject_label=row.name,
                 description=f"Downloaded {file}")
    db.commit()
    media = "application/gzip" if file.endswith(".gz") else "application/zip"
    return FileResponse(path, media_type=media, filename=f"{row.name}-{file}")


def get_settings(db: Session):
    return {"status": True, "data": schedule.payload(db)}


def update_settings(db: Session, payload: BackupSettingsSchema, request: Request):
    data = payload.model_dump()
    if not data["include_database"] and not data["include_files"]:
        raise HTTPException(status_code=422, detail={"errors": {"include_database": ["Choose the database, the uploaded files, or both."]}})
    before = {k: v for k, v in schedule.get_settings(db).items() if k in schedule.EDITABLE}
    schedule.save_settings(db, data)
    old, new = diff(before, data)
    log_activity(db, "updated", request=request, subject_type="settings", subject_label="backup_settings",
                 description="Updated the backup schedule", old_values=old, new_values=new)
    db.commit()
    runner.prune_scheduled(db, data["keep"])
    return {"status": True, "message": f"Backup schedule saved. {schedule.describe(db)}.", "data": schedule.payload(db)}
