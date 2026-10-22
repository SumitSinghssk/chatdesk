import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import STORAGE_DIR, settings

UPLOAD_DIR = STORAGE_DIR / "uploads"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"}
DOCUMENT_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

_MAGIC = {
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".ico": [b"\x00\x00\x01\x00"],
    ".pdf": [b"%PDF-"],
    ".zip": [b"PK\x03\x04"],
    ".docx": [b"PK\x03\x04"],
    ".xlsx": [b"PK\x03\x04"],
}


def public_url(rel: str) -> str:
    base = settings.UPLOADS_PUBLIC_URL
    if base:
        return f"{base}/{rel.removeprefix('uploads/')}"
    return f"/storage/{rel}"


def stored_path(path_or_url: str) -> str:
    base = settings.UPLOADS_PUBLIC_URL
    if base and path_or_url.startswith(base + "/"):
        return "uploads/" + path_or_url[len(base) + 1:]
    return path_or_url.split("/storage/", 1)[-1].lstrip("/")


def safe_folder(folder: str | None) -> str:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", (folder or "general").lower()).strip("-")
    return cleaned[:50] or "general"


def _check_magic(ext: str, head: bytes) -> None:
    if ext == ".webp":
        if not (head[:4] == b"RIFF" and head[8:12] == b"WEBP"):
            raise HTTPException(status_code=400, detail="This file isn't a real WEBP image.")
        return
    signatures = _MAGIC.get(ext)
    if signatures and not any(head.startswith(sig) for sig in signatures):
        raise HTTPException(status_code=400, detail=f"This file isn't a real {ext.lstrip('.').upper()} file.")


def save_upload(file: UploadFile, folder: str = "general", allowed: set[str] | None = None) -> dict:
    allowed = allowed or IMAGE_EXTS
    original = file.filename or "upload"
    ext = Path(original).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(sorted(allowed))}")

    folder = safe_folder(folder)
    target_dir = UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = target_dir / filename

    head = file.file.read(16)
    _check_magic(ext, head)
    total = len(head)
    with dest.open("wb") as out:
        out.write(head)
        while chunk := file.file.read(1024 * 64):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File exceeds the 10 MB limit")
            out.write(chunk)

    rel = f"uploads/{folder}/{filename}"
    return {
        "filename": filename,
        "original_name": original[:255],
        "path": rel,
        "url": public_url(rel),
        "size": total,
        "extension": ext.lstrip("."),
        "mime": file.content_type,
        "absolute_path": dest,
    }


def delete_stored_file(path_or_url: str | None) -> None:
    if not path_or_url:
        return
    rel = stored_path(path_or_url)
    target = (STORAGE_DIR / rel).resolve()
    try:
        target.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        return
    target.unlink(missing_ok=True)
