import glob
import gzip
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR, settings
from app.core.database import SessionLocal
from app.modules.admin.backups.models import Backup
from app.shared.utils.datetime import now
from app.shared.constants import admin_urls as urls

logger = logging.getLogger(__name__)

BACKUP_DIR = STORAGE_DIR / "backups"
UPLOADS_DIR = STORAGE_DIR / "uploads"

DATABASE_FILE = "database.sql.gz"
FILES_FILE = "files.zip"
LABELS = {DATABASE_FILE: "Database (.sql.gz)", FILES_FILE: "Uploaded files (.zip)"}

RUNNING, COMPLETED, FAILED = "running", "completed", "failed"

BACKUP_LOCK = 734_221_901
START_LOCK = 734_221_902

STALL_AFTER = timedelta(minutes=10)
STORE_ONLY = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".mp4", ".webm", ".mov", ".zip", ".gz", ".pdf", ".woff", ".woff2"}
PLACEHOLDERS = {".gitignore", ".gitkeep"}
_CHUNK = 1024 * 1024
_PROGRESS_EVERY = 2.0


def directory(backup: Backup) -> Path:
    return BACKUP_DIR / backup.name


def is_stalled(backup: Backup) -> bool:
    last = backup.updated_at or backup.started_at
    return backup.status == RUNNING and last is not None and last < now() - STALL_AFTER


def find_pg_dump() -> str | None:
    env = (os.getenv("PG_DUMP_PATH") or "").strip().strip('"')
    if env and Path(env).is_file():
        return env
    found = shutil.which("pg_dump")
    if found:
        return found
    candidates = glob.glob(r"C:\Program Files\PostgreSQL\*\bin\pg_dump.exe")

    def version(path: str) -> tuple:
        name = Path(path).parent.parent.name
        return tuple(int(p) if p.isdigit() else 0 for p in name.split("."))

    return max(candidates, key=version) if candidates else None


def pg_dump_version(binary: str) -> str | None:
    try:
        out = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None
    except Exception:
        return None


def remove_files(backup: Backup) -> None:
    folder = directory(backup).resolve()
    if folder.parent == BACKUP_DIR.resolve() and folder.is_dir():
        shutil.rmtree(folder, ignore_errors=True)


def _set(db: Session, backup: Backup, **fields) -> None:
    for key, value in fields.items():
        setattr(backup, key, value)
    backup.updated_at = now()
    db.commit()


def _fmt(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def start(db: Session, trigger: str, include_database: bool, include_files: bool, user_id: int | None = None) -> Backup:
    if not include_database and not include_files:
        raise HTTPException(status_code=422, detail={"errors": {"include_database": ["Choose the database, the uploaded files, or both."]}})

    busy = HTTPException(status_code=409, detail="A backup is already running. Wait for it to finish.")
    if not db.execute(text("select pg_try_advisory_xact_lock(:k)"), {"k": START_LOCK}).scalar():
        raise busy
    running = db.query(Backup).filter(Backup.status == RUNNING).order_by(Backup.id.desc()).first()
    if running and not is_stalled(running):
        raise busy
    for stale in db.query(Backup).filter(Backup.status == RUNNING).all():
        stale.status, stale.error, stale.finished_at = FAILED, "Interrupted (the process stopped) and replaced by a newer backup.", now()
        remove_files(stale)

    stamp = now().strftime("%Y-%m-%d-%H%M%S")
    name, i = f"backup-{stamp}", 2
    while db.query(Backup.id).filter(Backup.name == name).first():
        name, i = f"backup-{stamp}-{i}", i + 1

    backup = Backup(
        name=name, trigger=trigger, includes_database=include_database, includes_files=include_files,
        status=RUNNING, stage="Starting…", parts=[], size=0, started_at=now(), user_id=user_id,
    )
    db.add(backup)
    db.flush()
    directory(backup).mkdir(parents=True, exist_ok=True)
    return backup


def run_in_background(backup_id: int) -> None:
    threading.Thread(target=run, args=(backup_id,), name=f"backup-{backup_id}", daemon=True).start()


def run(backup_id: int) -> str:
    db = SessionLocal()
    try:
        backup = db.get(Backup, backup_id)
        if backup is None or backup.status != RUNNING:
            return backup.status if backup else FAILED
        folder = directory(backup)
        folder.mkdir(parents=True, exist_ok=True)
        parts: list[dict] = []
        notes: list[str] = []
        try:
            if backup.includes_database:
                _dump_database(db, backup, folder / DATABASE_FILE)
                parts.append(_part(folder, DATABASE_FILE))
            if backup.includes_files:
                count = _zip_uploads(db, backup, folder / FILES_FILE)
                if count:
                    parts.append(_part(folder, FILES_FILE))
                else:
                    notes.append("No uploaded files to archive")
            _set(db, backup, status=COMPLETED, parts=parts, size=sum(p["size"] for p in parts),
                 stage="; ".join(notes) or "Completed", finished_at=now(), error=None)
            if backup.trigger == "scheduled":
                from app.modules.admin.backups.schedule import get_settings

                prune_scheduled(db, int(get_settings(db).get("keep") or 7))
            return COMPLETED
        except Exception as exc:  # noqa: BLE001
            logger.exception("Backup %s failed", backup.name)
            db.rollback()
            backup = db.get(Backup, backup_id)
            remove_files(backup)
            _set(db, backup, status=FAILED, error=str(exc)[:1000] or exc.__class__.__name__, parts=[], size=0,
                 stage="Failed", finished_at=now())
            _notify_failure(db, backup)
            return FAILED
    finally:
        db.close()


def _part(folder: Path, file: str) -> dict:
    return {"file": file, "label": LABELS[file], "size": (folder / file).stat().st_size}


def _notify_failure(db: Session, backup: Backup) -> None:
    try:
        from app.modules.admin.notifications.service import notify_admins
        from app.shared.constants import permissions as P

        notify_admins(db, permission=P.BACKUPS_VIEW, type="backup.failed", title="Backup failed",
                      message=f"{backup.name}: {(backup.error or '')[:200]}", url=urls.BACKUPS,
                      data={"backup_id": backup.id})
        db.commit()
    except Exception:
        logger.exception("Could not notify admins about the failed backup")
        db.rollback()


def _dump_database(db: Session, backup: Backup, target: Path) -> None:
    binary = find_pg_dump()
    if not binary:
        raise RuntimeError("pg_dump was not found. Install the PostgreSQL client tools, add them to PATH, "
                           "or set PG_DUMP_PATH in .env to the full path of pg_dump.")
    url = make_url(settings.DATABASE_URL)
    env = {**os.environ, "PGPASSWORD": url.password or ""}
    sslmode = url.query.get("sslmode")
    if sslmode:
        env["PGSSLMODE"] = sslmode if isinstance(sslmode, str) else sslmode[0]
    cmd = [binary, "--format=plain", "--encoding=UTF8", "--no-owner", "--no-privileges", "--clean", "--if-exists",
           "-h", url.host or "localhost", "-p", str(url.port or 5432), "-U", url.username or "postgres",
           "-d", url.database or ""]

    _set(db, backup, stage="Dumping database…")
    with tempfile.TemporaryFile() as err, gzip.open(target, "wb", compresslevel=6) as out:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, env=env,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        written, last = 0, time.monotonic()
        assert proc.stdout is not None
        while chunk := proc.stdout.read(_CHUNK):
            out.write(chunk)
            written += len(chunk)
            if time.monotonic() - last > _PROGRESS_EVERY:
                _set(db, backup, stage=f"Dumping database… {_fmt(written)}")
                last = time.monotonic()
        code = proc.wait()
        if code != 0:
            err.seek(0)
            message = err.read().decode("utf-8", "replace").strip()
            raise RuntimeError(f"pg_dump failed (exit {code}): {message[:800] or 'no error output'}")
    if written == 0:
        raise RuntimeError("pg_dump produced no output.")


def _upload_files() -> list[Path]:
    if not UPLOADS_DIR.is_dir():
        return []
    return sorted(p for p in UPLOADS_DIR.rglob("*") if p.is_file() and not p.is_symlink() and p.name not in PLACEHOLDERS)


def _zip_uploads(db: Session, backup: Backup, target: Path) -> int:
    _set(db, backup, stage="Archiving files…")
    files = _upload_files()
    if not files:
        return 0
    total, last = len(files), time.monotonic()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for index, path in enumerate(files, 1):
            compress = zipfile.ZIP_STORED if path.suffix.lower() in STORE_ONLY else zipfile.ZIP_DEFLATED
            archive.write(path, arcname=f"uploads/{path.relative_to(UPLOADS_DIR).as_posix()}", compress_type=compress)
            if time.monotonic() - last > _PROGRESS_EVERY:
                _set(db, backup, stage=f"Archiving files… {index} of {total}")
                last = time.monotonic()
    return total


def delete_backup(db: Session, backup: Backup) -> None:
    remove_files(backup)
    db.delete(backup)


def prune_scheduled(db: Session, keep: int) -> int:
    old = (
        db.query(Backup).filter(Backup.trigger == "scheduled", Backup.status == COMPLETED)
        .order_by(Backup.id.desc()).offset(max(1, keep)).all()
    )
    failed = (
        db.query(Backup).filter(Backup.trigger == "scheduled", Backup.status == FAILED,
                                Backup.created_at < now() - timedelta(days=1)).all()
    )
    for row in old + failed:
        delete_backup(db, row)
    db.commit()
    return len(old) + len(failed)
