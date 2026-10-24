import logging
from datetime import timedelta

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.media.models import MediaFile
from app.modules.admin.media.schemas import MediaUpdateSchema
from app.modules.admin.users.models import User
from app.shared.pagination import list_response
from app.shared.utils.bulk import IdsSchema
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.uploads import (
    DOCUMENT_EXTS,
    IMAGE_EXTS,
    delete_stored_file,
    replace_stored_file,
    safe_folder,
    save_upload,
)

logger = logging.getLogger(__name__)

SUBJECT = "media"
DEFAULT_PER_PAGE = 48
ALLOWED_EXTS = IMAGE_EXTS | DOCUMENT_EXTS
IMAGE_EXT_NAMES = sorted(e.lstrip(".") for e in IMAGE_EXTS)
DOCUMENT_EXT_NAMES = sorted(e.lstrip(".") for e in DOCUMENT_EXTS)
_NON_RASTER = {"svg"}

_SORTS = {
    "newest": (MediaFile.id.desc(),),
    "oldest": (MediaFile.id.asc(),),
    "largest": (MediaFile.size.desc(), MediaFile.id.desc()),
    "smallest": (MediaFile.size.asc(), MediaFile.id.desc()),
    "name": (func.lower(func.coalesce(MediaFile.original_name, MediaFile.filename)).asc(), MediaFile.id.desc()),
}


def _serialize(row: MediaFile) -> dict:
    return {
        "id": row.id,
        "folder": row.folder,
        "filename": row.filename,
        "original_name": row.original_name,
        "url": row.url,
        "path": row.path,
        "mime": row.mime,
        "extension": row.extension,
        "size": row.size,
        "width": row.width,
        "height": row.height,
        "alt": row.alt,
        "uploaded_by": {"id": row.uploader.id, "name": row.uploader.name} if row.uploader else None,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _get_or_404(db: Session, media_id: int) -> MediaFile:
    row = db.query(MediaFile).options(joinedload(MediaFile.uploader)).filter(MediaFile.id == media_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Media file not found")
    return row


def _dimensions(absolute_path, extension: str) -> tuple[int | None, int | None]:
    if extension not in IMAGE_EXT_NAMES or extension in _NON_RASTER:
        return None, None
    try:
        from PIL import Image

        with Image.open(absolute_path) as img:
            return img.width, img.height
    except Exception:
        return None, None


_EXT = func.lower(MediaFile.extension)
_IS_IMAGE = _EXT.in_(IMAGE_EXT_NAMES)
_IS_DOCUMENT = _EXT.in_(DOCUMENT_EXT_NAMES)
_KIND = case((_IS_IMAGE, "image"), (_IS_DOCUMENT, "document"), else_="other")
_NAME = func.coalesce(MediaFile.original_name, MediaFile.filename)
_UPLOADER_NAME = select(User.name).where(User.id == MediaFile.uploaded_by).correlate(MediaFile).scalar_subquery()

GRID_FIELDS = {
    "id": GridField(MediaFile.id, "number"),
    "name": GridField(_NAME, "text"),
    "alt": GridField(MediaFile.alt, "text"),
    "folder": GridField(MediaFile.folder, "enum"),
    "kind": GridField(_KIND, "enum"),
    "extension": GridField(_EXT, "enum"),
    "size": GridField(MediaFile.size / 1024.0, "number"),
    "width": GridField(MediaFile.width, "number"),
    "height": GridField(MediaFile.height, "number"),
    "uploaded_by": GridField(_UPLOADER_NAME, "text"),
    "created_at": GridField(MediaFile.created_at, "date"),
    "has_alt": GridField(and_(MediaFile.alt.isnot(None), func.trim(MediaFile.alt) != ""), "bool", sortable=False),
}


def list_media(db: Session, page=None, per_page=None, search=None, folder=None, type_=None, sort=None,
               filters: str | None = None, match: str | None = "and"):
    q = db.query(MediaFile).options(joinedload(MediaFile.uploader))
    clause = search_clause([MediaFile.original_name, MediaFile.filename, MediaFile.alt, MediaFile.folder], search)
    if clause is not None:
        q = q.filter(clause)
    if folder:
        q = q.filter(MediaFile.folder == folder)
    if type_ == "image":
        q = q.filter(_IS_IMAGE)
    elif type_ == "document":
        q = q.filter(_IS_DOCUMENT)
    q = apply_filters(q, GRID_FIELDS, filters, match)
    if sort in _SORTS:
        q = q.order_by(*_SORTS[sort])
    else:
        q = apply_sort(q, GRID_FIELDS, sort, [MediaFile.id.desc()])
    return list_response(q, _serialize, page or 1, per_page or DEFAULT_PER_PAGE, search)


def folders(db: Session):
    rows = (
        db.query(MediaFile.folder, func.count(MediaFile.id))
        .group_by(MediaFile.folder)
        .order_by(MediaFile.folder.asc())
        .all()
    )
    return {"status": True, "data": [{"folder": f, "count": c} for f, c in rows]}


def stats(db: Session):
    current = now()
    week_start = current - timedelta(days=7)

    def count(*filters) -> int:
        return db.query(func.count(MediaFile.id)).filter(*filters).scalar() or 0

    total, total_size = db.query(func.count(MediaFile.id), func.coalesce(func.sum(MediaFile.size), 0)).one()
    image_size = db.query(func.coalesce(func.sum(MediaFile.size), 0)).filter(_IS_IMAGE).scalar() or 0
    images = count(_IS_IMAGE)
    documents = count(_IS_DOCUMENT)
    return {"status": True, "data": {
        "total": total,
        "total_size": int(total_size or 0),
        "image_size": int(image_size),
        "images": images,
        "documents": documents,
        "other": max(total - images - documents, 0),
        "last_7_days": count(MediaFile.created_at >= week_start),
        "previous_7_days": count(MediaFile.created_at >= week_start - timedelta(days=7),
                                 MediaFile.created_at < week_start),
        "missing_alt": count(_IS_IMAGE, or_(MediaFile.alt.is_(None), func.trim(MediaFile.alt) == "")),
        "folders": db.query(func.count(func.distinct(MediaFile.folder))).scalar() or 0,
    }}


def get_media(db: Session, media_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, media_id))}


def upload(db: Session, file: UploadFile, folder: str | None, alt: str | None, request: Request):
    folder = safe_folder(folder)
    meta = save_upload(file, folder, allowed=ALLOWED_EXTS)
    try:
        width, height = _dimensions(meta["absolute_path"], meta["extension"])
        alt = (alt or "").strip()[:255] or None
        row = MediaFile(
            folder=folder,
            filename=meta["filename"],
            original_name=meta["original_name"],
            path=meta["path"],
            url=meta["url"],
            mime=(meta["mime"] or None) and meta["mime"][:100],
            extension=meta["extension"][:10],
            size=meta["size"],
            width=width,
            height=height,
            alt=alt,
            uploaded_by=get_current_user(request).id,
        )
        db.add(row)
        db.flush()
        log_activity(db, "uploaded", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=row.original_name, new_values={"folder": folder, "url": row.url, "size": row.size})
        db.commit()
    except Exception:
        db.rollback()
        delete_stored_file(meta["path"])
        raise
    return {"status": True, "message": "File uploaded", "data": _serialize(_get_or_404(db, row.id))}


def update_media(db: Session, media_id: int, payload: MediaUpdateSchema, request: Request):
    row = _get_or_404(db, media_id)
    before = row.alt
    row.alt = (payload.alt or "").strip() or None
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.original_name, old_values={"alt": before}, new_values={"alt": row.alt})
    db.commit()
    return {"status": True, "message": "Media updated", "data": _serialize(row)}


def replace_media(db: Session, media_id: int, file: UploadFile, request: Request):
    row = _get_or_404(db, media_id)
    meta = save_upload(file, row.folder, allowed=ALLOWED_EXTS)
    if meta["extension"] != (row.extension or "").lower():
        delete_stored_file(meta["path"])
        raise HTTPException(status_code=422, detail="Choose a file with the same extension to keep this file's URL unchanged.")

    before = {"size": row.size, "mime": row.mime, "dimensions": [row.width, row.height]}
    try:
        width, height = _dimensions(meta["absolute_path"], meta["extension"])
        replace_stored_file(row.path, meta["absolute_path"])
        row.mime = (meta["mime"] or None) and meta["mime"][:100]
        row.size = meta["size"]
        row.width = width
        row.height = height
        row.uploaded_by = get_current_user(request).id
        log_activity(
            db,
            "updated",
            request=request,
            subject_type=SUBJECT,
            subject_id=row.id,
            subject_label=row.original_name,
            description="Replaced file while preserving its URL",
            old_values=before,
            new_values={"size": row.size, "mime": row.mime, "dimensions": [row.width, row.height]},
        )
        db.commit()
    except Exception:
        db.rollback()
        if meta["absolute_path"].exists():
            delete_stored_file(meta["path"])
        raise
    return {"status": True, "message": "File replaced", "data": _serialize(_get_or_404(db, row.id))}


def delete_media(db: Session, media_id: int, request: Request):
    row = _get_or_404(db, media_id)
    path = row.path
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.original_name, old_values={"url": row.url})
    db.delete(row)
    db.commit()
    delete_stored_file(path)
    return {"status": True, "message": "File deleted"}


def bulk_delete(db: Session, payload: IdsSchema, request: Request):
    rows = db.query(MediaFile).filter(MediaFile.id.in_(payload.ids)).all()
    paths = [r.path for r in rows]
    for row in rows:
        db.delete(row)
    for row in rows:
        log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=row.original_name, description="Deleted in a bulk action",
                     old_values={"url": row.url, "size": row.size})
    db.commit()
    for path in paths:
        delete_stored_file(path)
    return {"status": True, "message": f"{len(rows)} files deleted"}
