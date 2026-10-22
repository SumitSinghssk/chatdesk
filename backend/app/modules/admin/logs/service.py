import re
from collections import deque
from datetime import date, datetime
from pathlib import Path
from threading import Lock

from fastapi import HTTPException, Request

from app.core.logging_config import LOGS_DIR
from app.modules.admin.activity_log.service import log_activity
from app.shared.utils.datetime import iso

SUBJECT = "log_file"
NAME_PATTERN = re.compile(r"^app-[\d-]+(\.\d+)?\.log$")
DEFAULT_LINES = 500
MAX_LINES = 5000
_TAIL_BLOCK = 64 * 1024
COUNT_MAX_BYTES = 10 * 1024 * 1024
_LEVEL = re.compile(rb"^\[[^\]]*\] (ERROR|CRITICAL|WARNING) in ", re.MULTILINE)
_counts_cache: dict[tuple[str, int, float], dict] = {}
_cache_lock = Lock()


def _files() -> list[Path]:
    if not LOGS_DIR.exists():
        return []
    files = [p for p in LOGS_DIR.iterdir() if p.is_file() and NAME_PATTERN.match(p.name)]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def _day_of(name: str) -> str | None:
    match = re.match(r"^app-(\d{4}-\d{2}-\d{2})", name)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1)).isoformat()
    except ValueError:
        return None


def _level_counts(path: Path, size: int, mtime: float) -> dict:
    if size > COUNT_MAX_BYTES:
        return {"errors": None, "warnings": None}
    key = (path.name, size, mtime)
    with _cache_lock:
        hit = _counts_cache.get(key)
    if hit is not None:
        return hit
    errors = warnings = 0
    try:
        for level in _LEVEL.findall(path.read_bytes()):
            if level == b"WARNING":
                warnings += 1
            else:
                errors += 1
    except OSError:
        return {"errors": None, "warnings": None}
    result = {"errors": errors, "warnings": warnings}
    with _cache_lock:
        for stale in [k for k in _counts_cache if k[0] == path.name]:
            del _counts_cache[stale]
        _counts_cache[key] = result
    return result


def _info(path: Path, counts: bool = True) -> dict:
    stat = path.stat()
    info = {"name": path.name, "date": _day_of(path.name), "size": stat.st_size,
            "modified_at": iso(datetime.fromtimestamp(stat.st_mtime))}
    if counts:
        info.update(_level_counts(path, stat.st_size, stat.st_mtime))
    return info


def _resolve(name: str) -> Path:
    if not NAME_PATTERN.match(name or ""):
        raise HTTPException(status_code=404, detail="Log file not found")
    base = LOGS_DIR.resolve()
    path = (LOGS_DIR / name).resolve()
    try:
        path.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=404, detail="Log file not found")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Log file not found")
    return path


def _tail(path: Path, lines: int) -> list[str]:
    with path.open("rb") as fh:
        fh.seek(0, 2)
        end = fh.tell()
        buffer = b""
        pos = end
        while pos > 0 and buffer.count(b"\n") <= lines:
            step = min(_TAIL_BLOCK, pos)
            pos -= step
            fh.seek(pos)
            buffer = fh.read(step) + buffer
    text = buffer.decode("utf-8", errors="replace")
    return list(deque(text.splitlines(), maxlen=lines))


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except PermissionError:
        with path.open("w", encoding="utf-8"):
            pass


def list_files():
    return {"status": True, "data": [_info(p) for p in _files()]}


def stats():
    files = [_info(p) for p in _files()]
    today = date.today().isoformat()
    todays = next((f for f in files if f["date"] == today), None)
    return {
        "status": True,
        "data": {
            "files": len(files),
            "total_size": sum(f["size"] for f in files),
            "errors_today": todays["errors"] if todays else 0,
            "warnings_today": todays["warnings"] if todays else 0,
            "errors_total": sum(f["errors"] or 0 for f in files),
            "latest_at": files[0]["modified_at"] if files else None,
        },
    }


def read_file(name: str, lines: int = DEFAULT_LINES):
    path = _resolve(name)
    lines = max(1, min(MAX_LINES, lines or DEFAULT_LINES))
    content = _tail(path, lines)
    return {"status": True, "data": {**_info(path, counts=False), "lines": content, "line_count": len(content)}}


def delete_file(db, name: str, request: Request):
    path = _resolve(name)
    _remove(path)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_label=name,
                 description=f"Deleted log file {name}")
    db.commit()
    return {"status": True, "message": f"{name} deleted"}


def delete_all(db, request: Request):
    files = _files()
    for path in files:
        _remove(path)
    log_activity(db, "cleared", request=request, subject_type=SUBJECT,
                 description=f"Deleted {len(files)} log files")
    db.commit()
    return {"status": True, "message": f"{len(files)} log files deleted"}
