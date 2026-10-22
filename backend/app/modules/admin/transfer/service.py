import logging
import re
import time
import uuid
from pathlib import Path

from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR
from app.core.database import SessionLocal
from app.core.dependencies import get_current_user, has_permission
from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.transfer import csv_io
from app.modules.admin.transfer.types import TYPES, Prepared, RowError, TransferType
from app.shared.utils.datetime import now

logger = logging.getLogger(__name__)

IMPORT_DIR = STORAGE_DIR / "imports"
MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000
PREVIEW_ROWS = 200
ERROR_ROWS = 100
STALE_SECONDS = 24 * 3600
_TOKEN = re.compile(r"^[0-9a-f]{32}$")


def _forbidden(permission: str) -> HTTPException:
    return HTTPException(status_code=403, detail=f"Missing permission: {permission}")


def _file_error(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": message, "errors": {"file": [message]}})


def get_type(key: str) -> TransferType:
    transfer = TYPES.get(key)
    if transfer is None:
        raise HTTPException(status_code=404, detail="Unknown import/export type")
    return transfer


def _require(request: Request, permission: str) -> None:
    if not has_permission(request, permission):
        raise _forbidden(permission)


def _importable(request: Request, key: str) -> TransferType:
    transfer = get_type(key)
    if not transfer.importable:
        raise HTTPException(status_code=404, detail=f"{transfer.label} can't be imported")
    _require(request, transfer.create_perm)
    return transfer


def _csv_response(filename: str, chunks) -> StreamingResponse:
    return StreamingResponse(
        chunks,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


def export(db: Session, key: str, request: Request) -> StreamingResponse:
    transfer = get_type(key)
    _require(request, transfer.view_perm)
    log_activity(db, "exported", request=request, subject_type=transfer.subject,
                 description=f"Exported {transfer.label.lower()} to CSV")
    db.commit()

    def rows():
        session = SessionLocal()
        try:
            for row in transfer.export_query(session).yield_per(500):
                yield transfer.export_row(row)
        finally:
            session.close()

    filename = f"{transfer.key.replace('_', '-')}-{now():%Y-%m-%d}.csv"
    return _csv_response(filename, csv_io.stream(transfer.export_headers(), rows()))


def template(key: str, request: Request) -> StreamingResponse:
    transfer = _importable(request, key)
    example = [c.example for c in transfer.columns]
    return _csv_response(f"{transfer.key.replace('_', '-')}-import-template.csv",
                         csv_io.stream(transfer.column_names, [example]))


def _analyse(db: Session, transfer: TransferType, raw: bytes) -> dict:
    headers, rows = csv_io.read(raw, MAX_ROWS)
    known = transfer.column_names
    missing = [c.name for c in transfer.columns if c.required and c.name not in headers]
    if missing:
        noun = "column" if len(missing) == 1 else "columns"
        raise _file_error(f"The file is missing the required {noun}: {', '.join(missing)}. "
                          "Download the template to see the expected columns.")
    if not rows:
        raise _file_error("The file has column names but no rows.")

    unknown = [h for h in headers if h not in known and h not in transfer.export_extra]
    seen: dict[str, int] = {}
    earlier: set[str] = set()
    analysed = []
    for line, values in rows:
        values = {k: values.get(k, "") for k in known}
        item = {"line": line, "label": "", "status": "new", "messages": [], "warnings": [], "prepared": None,
                "existing": None}
        try:
            prepared: Prepared = transfer.build(db, values, earlier)
        except RowError as exc:
            item.update(status="invalid", messages=exc.messages,
                        label=(values.get(known[0]) or "")[:120])
            analysed.append(item)
            continue

        item.update(label=prepared.label[:200], warnings=prepared.warnings, prepared=prepared)
        identity = prepared.identity
        if identity and identity in seen:
            item.update(status="duplicate",
                        messages=[f"Same as line {seen[identity]} of this file; only the first one is imported."])
        else:
            existing = transfer.find_existing(db, prepared)
            if existing is not None:
                item.update(status="exists", existing=existing,
                            messages=[f"Already exists ({identity})."])
            else:
                try:
                    transfer.check(db, prepared)
                    earlier.add(identity)
                except RowError as exc:
                    item.update(status="invalid", messages=exc.messages)
        if identity:
            seen.setdefault(identity, line)
        analysed.append(item)

    counts = {k: 0 for k in ("new", "exists", "duplicate", "invalid")}
    for item in analysed:
        counts[item["status"]] += 1
    return {"rows": analysed, "counts": counts, "unknown": unknown}


def _public_row(item: dict) -> dict:
    return {k: item[k] for k in ("line", "label", "status", "messages", "warnings")}


def _clean_stale() -> None:
    try:
        cutoff = time.time() - STALE_SECONDS
        for path in IMPORT_DIR.glob("*.csv"):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not clean old import files", exc_info=True)


def _token_path(token: str) -> Path:
    if not _TOKEN.match(token or ""):
        raise HTTPException(status_code=422, detail={"message": "This upload has expired. Upload the file again.",
                                                     "errors": {"token": ["Invalid upload token"]}})
    return IMPORT_DIR / f"{token}.csv"


def preview(db: Session, key: str, file: UploadFile, request: Request) -> dict:
    transfer = _importable(request, key)
    if not file or not (file.filename or "").lower().endswith(".csv"):
        raise _file_error("Upload a .csv file (in Excel: File → Save as → CSV UTF-8).")
    raw = file.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise _file_error("The file can be at most 10 MB.")
    if not raw.strip():
        raise _file_error("The file is empty.")

    result = _analyse(db, transfer, raw)
    db.rollback()

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    _clean_stale()
    token = uuid.uuid4().hex
    (IMPORT_DIR / f"{token}.csv").write_bytes(raw)

    return {
        "status": True,
        "data": {
            "token": token,
            "filename": file.filename,
            "total": len(result["rows"]),
            "counts": result["counts"],
            "columns": transfer.column_names,
            "unknown_columns": result["unknown"],
            "can_update": bool(transfer.update_perm and has_permission(request, transfer.update_perm)),
            "rows": [_public_row(r) for r in result["rows"][:PREVIEW_ROWS]],
        },
    }


def run_import(db: Session, key: str, token: str, mode: str, request: Request) -> dict:
    transfer = _importable(request, key)
    if mode not in ("create", "create_update"):
        raise HTTPException(status_code=422, detail={"message": "Choose how to import",
                                                     "errors": {"mode": ["Must be create or create_update"]}})
    if mode == "create_update":
        _require(request, transfer.update_perm)

    path = _token_path(token)
    if not path.exists():
        raise HTTPException(status_code=422, detail={"message": "This upload has expired. Upload the file again.",
                                                     "errors": {"token": ["Upload not found"]}})
    user = get_current_user(request)
    try:
        analysis = _analyse(db, transfer, path.read_bytes())
        report = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}
        errors: list[dict] = []

        for item in analysis["rows"]:
            status = item["status"]
            if status in ("invalid", "duplicate") or (status == "exists" and mode == "create"):
                report["skipped"] += 1
                if status == "invalid" and len(errors) < ERROR_ROWS:
                    errors.append(_public_row(item))
                continue
            try:
                with db.begin_nested():
                    transfer.save(db, item["prepared"], item["existing"], user)
                    db.flush()
                report["updated" if item["existing"] is not None else "created"] += 1
            except RowError as exc:
                report["failed"] += 1
                if len(errors) < ERROR_ROWS:
                    errors.append({**_public_row(item), "status": "failed", "messages": exc.messages})
            except Exception as exc:  # noqa: BLE001
                logger.warning("Import row %s failed: %s", item["line"], exc)
                report["failed"] += 1
                if len(errors) < ERROR_ROWS:
                    errors.append({**_public_row(item), "status": "failed",
                                   "messages": [f"Could not be saved: {type(exc).__name__}."]})

        log_activity(db, "imported", request=request, subject_type=transfer.subject,
                     description=(f"Imported {transfer.label.lower()} from CSV: {report['created']} created, "
                                  f"{report['updated']} updated, {report['skipped']} skipped, "
                                  f"{report['failed']} failed"),
                     new_values={**report, "mode": mode})
        db.commit()
    finally:
        path.unlink(missing_ok=True)

    changed = report["created"] + report["updated"]
    message = (f"Imported {changed} {transfer.noun}." if changed
               else "Nothing was imported.")
    return {"status": True, "message": message, "data": {**report, "total": len(analysis["rows"]), "errors": errors}}
