import re
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.galleries.models import Gallery, GalleryItem
from app.modules.admin.galleries.schemas import (
    GalleryCoverSchema,
    GalleryCreateSchema,
    GalleryItemUpdateSchema,
    GalleryUpdateSchema,
    GalleryYoutubeSchema,
)
from app.shared.enums import GalleryItemType, Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema, IdsSchema, ReorderSchema
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_slug
from app.shared.utils.uploads import delete_stored_file, save_upload

SUBJECT = "gallery"
MAX_FILES_PER_UPLOAD = 50
_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_thumbnail(youtube_id: str | None) -> str | None:
    return f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg" if youtube_id else None


def parse_youtube_id(url: str | None) -> str | None:
    value = (url or "").strip()
    if _YOUTUBE_ID.match(value):
        return value
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m."):
        host = host[2:]
    candidate = None
    if host == "youtu.be":
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com", "music.youtube.com"):
        parts = [p for p in parsed.path.split("/") if p]
        if parsed.path.rstrip("/") == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
            candidate = parts[1]
    return candidate if candidate and _YOUTUBE_ID.match(candidate) else None


def serialize_item(item: GalleryItem) -> dict:
    is_youtube = item.type == GalleryItemType.YOUTUBE.value
    return {
        "id": item.id,
        "type": item.type,
        "path": item.path,
        "youtube_id": item.youtube_id,
        "title": item.title,
        "caption": item.caption,
        "sort_order": item.sort_order,
        "thumbnail": youtube_thumbnail(item.youtube_id) if is_youtube else item.path,
    }


def _first_image_subquery():
    return (
        select(GalleryItem.path)
        .where(GalleryItem.gallery_id == Gallery.id, GalleryItem.type == GalleryItemType.IMAGE.value)
        .order_by(GalleryItem.sort_order.asc(), GalleryItem.id.asc())
        .limit(1)
        .correlate(Gallery)
        .scalar_subquery()
    )


def card_query(db: Session):
    counts = (
        db.query(
            GalleryItem.gallery_id.label("gallery_id"),
            func.count(GalleryItem.id).label("items_count"),
            func.count(GalleryItem.id).filter(GalleryItem.type == GalleryItemType.IMAGE.value).label("image_count"),
            func.count(GalleryItem.id).filter(GalleryItem.type == GalleryItemType.YOUTUBE.value).label("youtube_count"),
        )
        .group_by(GalleryItem.gallery_id)
        .subquery()
    )
    return (
        db.query(
            Gallery,
            func.coalesce(counts.c.items_count, 0),
            func.coalesce(counts.c.image_count, 0),
            func.coalesce(counts.c.youtube_count, 0),
            _first_image_subquery(),
        )
        .outerjoin(counts, counts.c.gallery_id == Gallery.id)
    )


def _base(row: Gallery) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "description": row.description,
        "event_date": row.event_date.isoformat() if row.event_date else None,
        "cover_image": row.cover_image,
        "is_featured": row.is_featured,
        "sort_order": row.sort_order,
        "status": row.status,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def serialize_card(result) -> dict:
    row, items_count, image_count, youtube_count, first_image = result
    data = _base(row)
    data.update({
        "cover_image": row.cover_image or first_image,
        "items_count": items_count,
        "image_count": image_count,
        "youtube_count": youtube_count,
    })
    return data


def serialize_detail(row: Gallery) -> dict:
    items = list(row.items or [])
    first_image = next((i.path for i in items if i.type == GalleryItemType.IMAGE.value and i.path), None)
    data = _base(row)
    data.update({
        "cover_image": row.cover_image or first_image,
        "stored_cover_image": row.cover_image,
        "items_count": len(items),
        "image_count": sum(1 for i in items if i.type == GalleryItemType.IMAGE.value),
        "youtube_count": sum(1 for i in items if i.type == GalleryItemType.YOUTUBE.value),
        "items": [serialize_item(i) for i in items],
    })
    return data


def _snapshot(row: Gallery) -> dict:
    return {"title": row.title, "slug": row.slug, "description": row.description,
            "event_date": row.event_date.isoformat() if row.event_date else None,
            "cover_image": row.cover_image, "is_featured": row.is_featured,
            "sort_order": row.sort_order, "status": row.status}


def _get_or_404(db: Session, gallery_id: int) -> Gallery:
    row = db.query(Gallery).options(selectinload(Gallery.items)).filter(Gallery.id == gallery_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Gallery not found")
    return row


def _get_item_or_404(db: Session, gallery_id: int, item_id: int) -> GalleryItem:
    item = db.query(GalleryItem).filter(GalleryItem.id == item_id, GalleryItem.gallery_id == gallery_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    return item


def _slug_taken(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    q = db.query(Gallery.id).filter(Gallery.slug == slug)
    if exclude_id is not None:
        q = q.filter(Gallery.id != exclude_id)
    return db.query(q.exists()).scalar()


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _prepare(db: Session, payload, exclude_id: int | None = None) -> dict:
    data = payload.model_dump()
    data["status"] = payload.status.value
    data["slug"] = normalize_slug(data.get("slug") or data["title"])
    if not data["slug"]:
        raise _field_error("slug", "Slug is required")
    if _slug_taken(db, data["slug"], exclude_id):
        raise _field_error("slug", "This slug is already in use")
    return data


def _next_sort_order(db: Session, gallery_id: int) -> int:
    current = db.query(func.max(GalleryItem.sort_order)).filter(GalleryItem.gallery_id == gallery_id).scalar()
    return 0 if current is None else current + 1


def _detail_response(db: Session, gallery_id: int, message: str) -> dict:
    db.expire_all()
    return {"status": True, "message": message, "data": serialize_detail(_get_or_404(db, gallery_id))}


def _image_paths(items) -> list[str]:
    return [i.path for i in items if i.type == GalleryItemType.IMAGE.value and i.path]


def _delete_files(paths: list[str]) -> None:
    for path in paths:
        delete_stored_file(path)


def _item_count(*filters):
    return (
        select(func.count(GalleryItem.id))
        .where(GalleryItem.gallery_id == Gallery.id, *filters)
        .correlate(Gallery)
        .scalar_subquery()
    )


_ITEMS = _item_count()
_IMAGES = _item_count(GalleryItem.type == GalleryItemType.IMAGE.value)
_VIDEOS = _item_count(GalleryItem.type == GalleryItemType.YOUTUBE.value)
_HAS_COVER = or_(and_(Gallery.cover_image.isnot(None), Gallery.cover_image != ""), _IMAGES > 0)

GRID_FIELDS = {
    "id": GridField(Gallery.id, "number"),
    "title": GridField(Gallery.title, "text"),
    "slug": GridField(Gallery.slug, "text"),
    "description": GridField(Gallery.description, "text", sortable=False),
    "event_date": GridField(Gallery.event_date, "date"),
    "status": GridField(Gallery.status, "enum"),
    "is_featured": GridField(Gallery.is_featured, "bool"),
    "items_count": GridField(_ITEMS, "number"),
    "image_count": GridField(_IMAGES, "number"),
    "youtube_count": GridField(_VIDEOS, "number"),
    "has_cover": GridField(_HAS_COVER, "bool", sortable=False),
    "sort_order": GridField(Gallery.sort_order, "number"),
    "created_at": GridField(Gallery.created_at, "date"),
    "updated_at": GridField(Gallery.updated_at, "date"),
}


def list_galleries(db: Session, page=None, per_page=None, search=None, status=None, featured=None,
                   filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = card_query(db)
    clause = search_clause([Gallery.title, Gallery.slug, Gallery.description], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Gallery.status == status)
    if featured is not None:
        q = q.filter(Gallery.is_featured.is_(featured))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Gallery.sort_order.asc(), Gallery.id.desc()])
    return list_response(q, serialize_card, page, per_page, search)


def stats(db: Session):
    week_start = now() - timedelta(days=7)

    def count(*filters) -> int:
        return db.query(func.count(Gallery.id)).filter(*filters).scalar() or 0

    by_status = dict(db.query(Gallery.status, func.count(Gallery.id)).group_by(Gallery.status).all())
    by_type = dict(db.query(GalleryItem.type, func.count(GalleryItem.id)).group_by(GalleryItem.type).all())
    return {"status": True, "data": {
        "total": sum(by_status.values()),
        "active": by_status.get(Status.ACTIVE.value, 0),
        "inactive": by_status.get(Status.INACTIVE.value, 0),
        "featured": count(Gallery.is_featured.is_(True)),
        "empty": count(_ITEMS == 0),
        "without_cover": count(~_HAS_COVER),
        "images": by_type.get(GalleryItemType.IMAGE.value, 0),
        "videos": by_type.get(GalleryItemType.YOUTUBE.value, 0),
        "items_last_7_days": db.query(func.count(GalleryItem.id))
        .filter(GalleryItem.created_at >= week_start).scalar() or 0,
    }}


def get_gallery(db: Session, gallery_id: int):
    return {"status": True, "data": serialize_detail(_get_or_404(db, gallery_id))}


def create_gallery(db: Session, payload: GalleryCreateSchema, request: Request):
    row = Gallery(**_prepare(db, payload))
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, new_values=_snapshot(row))
    db.commit()
    return _detail_response(db, row.id, "Gallery created")


def update_gallery(db: Session, gallery_id: int, payload: GalleryUpdateSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    before = _snapshot(row)
    for key, value in _prepare(db, payload, exclude_id=row.id).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values=old, new_values=new)
    db.commit()
    return _detail_response(db, row.id, "Gallery updated")


def toggle_status(db: Session, gallery_id: int, request: Request):
    row = _get_or_404(db, gallery_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return _detail_response(db, row.id, f"Gallery {row.status}")


def delete_gallery(db: Session, gallery_id: int, request: Request):
    row = _get_or_404(db, gallery_id)
    items = list(row.items)
    paths = _image_paths(items)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Deleted gallery with {len(items)} items", old_values=_snapshot(row))
    db.delete(row)
    db.commit()
    _delete_files(paths)
    return {"status": True, "message": "Gallery deleted"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Gallery).options(selectinload(Gallery.items)).filter(Gallery.id.in_(payload.ids)).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    to_purge = []
    for row in rows:
        if payload.action == "delete":
            to_purge.extend(_image_paths(row.items))
            db.delete(row)
        else:
            row.status = Status.ACTIVE.value if payload.action == "activate" else Status.INACTIVE.value
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: r.title,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    _delete_files(to_purge)
    return {"status": True, "message": f"{len(rows)} galleries updated"}


def reorder(db: Session, payload: ReorderSchema, request: Request):
    ids = list(dict.fromkeys(payload.ids))
    rows = {r.id: r for r in db.query(Gallery).filter(Gallery.id.in_(ids)).all()}
    for index, gallery_id in enumerate(ids):
        if gallery_id in rows:
            rows[gallery_id].sort_order = index
    log_activity(db, "reordered", request=request, subject_type=SUBJECT,
                 description=f"Reordered {len(rows)} galleries", new_values={"ids": ids})
    db.commit()
    return {"status": True, "message": "Order saved"}


def upload_items(db: Session, gallery_id: int, files: list[UploadFile], request: Request):
    row = _get_or_404(db, gallery_id)
    files = [f for f in (files or []) if f and f.filename]
    if not files:
        raise _field_error("files", "Select at least one image")
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise _field_error("files", f"You can upload at most {MAX_FILES_PER_UPLOAD} files at once")

    saved: list[dict] = []
    try:
        for file in files:
            saved.append(save_upload(file, "gallery"))
    except Exception:
        for meta in saved:
            delete_stored_file(meta["path"])
        raise

    order = _next_sort_order(db, row.id)
    for offset, meta in enumerate(saved):
        title = meta["original_name"].rsplit(".", 1)[0][:255] or None
        db.add(GalleryItem(gallery_id=row.id, type=GalleryItemType.IMAGE.value, path=meta["url"],
                           title=title, sort_order=order + offset))
    log_activity(db, "items_added", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Uploaded {len(saved)} images",
                 new_values={"images": [m["original_name"] for m in saved]})
    db.commit()
    return _detail_response(db, row.id, f"{len(saved)} images added")


def add_youtube(db: Session, gallery_id: int, payload: GalleryYoutubeSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    youtube_id = parse_youtube_id(payload.url)
    if not youtube_id:
        raise _field_error("url", "Enter a valid YouTube video link")
    db.add(GalleryItem(gallery_id=row.id, type=GalleryItemType.YOUTUBE.value, youtube_id=youtube_id,
                       title=payload.title, caption=payload.caption, sort_order=_next_sort_order(db, row.id)))
    log_activity(db, "items_added", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Added YouTube video {youtube_id}",
                 new_values={"youtube_id": youtube_id, "title": payload.title})
    db.commit()
    return _detail_response(db, row.id, "Video added")


def update_item(db: Session, gallery_id: int, item_id: int, payload: GalleryItemUpdateSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    item = _get_item_or_404(db, gallery_id, item_id)
    before = {"title": item.title, "caption": item.caption}
    item.title = payload.title
    item.caption = payload.caption
    old, new = diff(before, {"title": item.title, "caption": item.caption})
    log_activity(db, "item_updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Updated item “{item.title or item.id}”",
                 old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Item updated", "data": serialize_item(item)}


def _item_label(item: GalleryItem) -> str:
    source = f"YouTube {item.youtube_id}" if item.type == GalleryItemType.YOUTUBE.value else item.path
    return f"{item.title} ({source})" if item.title else str(source)


def delete_item(db: Session, gallery_id: int, item_id: int, request: Request):
    row = _get_or_404(db, gallery_id)
    item = _get_item_or_404(db, gallery_id, item_id)
    paths = _image_paths([item])
    log_activity(db, "items_removed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Removed item “{item.title or item.id}”",
                 old_values={"items": [_item_label(item)]})
    db.delete(item)
    db.commit()
    _delete_files(paths)
    return _detail_response(db, row.id, "Item removed")


def reorder_items(db: Session, gallery_id: int, payload: ReorderSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    ids = list(dict.fromkeys(payload.ids))
    items = {i.id: i for i in row.items}
    for index, item_id in enumerate(ids):
        if item_id in items:
            items[item_id].sort_order = index
    log_activity(db, "reordered", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Reordered {len(ids)} items")
    db.commit()
    return _detail_response(db, row.id, "Order saved")


def bulk_delete_items(db: Session, gallery_id: int, payload: IdsSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    items = (
        db.query(GalleryItem)
        .filter(GalleryItem.gallery_id == row.id, GalleryItem.id.in_(payload.ids))
        .all()
    )
    paths = _image_paths(items)
    for item in items:
        db.delete(item)
    log_activity(db, "items_removed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description=f"Removed {len(items)} items",
                 old_values={"items": [_item_label(i) for i in items]})
    db.commit()
    _delete_files(paths)
    return _detail_response(db, row.id, f"{len(items)} items removed")


def set_cover(db: Session, gallery_id: int, payload: GalleryCoverSchema, request: Request):
    row = _get_or_404(db, gallery_id)
    item = _get_item_or_404(db, gallery_id, payload.item_id)
    before = row.cover_image
    row.cover_image = youtube_thumbnail(item.youtube_id) if item.type == GalleryItemType.YOUTUBE.value else item.path
    log_activity(db, "cover_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=row.title, description="Changed the cover image", old_values={"cover_image": before},
                 new_values={"cover_image": row.cover_image})
    db.commit()
    return _detail_response(db, row.id, "Cover image updated")
