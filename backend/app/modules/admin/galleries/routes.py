from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BeforeValidator
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.galleries import service
from app.modules.admin.galleries.schemas import (
    GalleryCoverSchema,
    GalleryCreateSchema,
    GalleryItemUpdateSchema,
    GalleryUpdateSchema,
    GalleryYoutubeSchema,
)
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.bulk import BulkActionSchema, IdsSchema, ReorderSchema

router = APIRouter(prefix="/galleries", tags=["Admin Galleries"])

OptionalBool = Annotated[bool | None, BeforeValidator(lambda v: None if isinstance(v, str) and not v.strip() else v)]


@router.get("/", dependencies=[Depends(require_admin_permission(P.GALLERIES_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    featured: OptionalBool = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_galleries(db, page, per_page, search, status.value if status else None, featured,
                                  filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.GALLERIES_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.GALLERIES_CREATE))])
def store(payload: GalleryCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_gallery(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE, P.GALLERIES_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.GALLERIES_UPDATE, P.GALLERIES_DELETE)
    return service.bulk_action(db, payload, request)


@router.post("/reorder", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def reorder(payload: ReorderSchema, request: Request, db: Session = Depends(get_db)):
    return service.reorder(db, payload, request)


@router.get("/{gallery_id}", dependencies=[Depends(require_admin_permission(P.GALLERIES_VIEW))])
def show(gallery_id: int, db: Session = Depends(get_db)):
    return service.get_gallery(db, gallery_id)


@router.put("/{gallery_id}", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def update(gallery_id: int, payload: GalleryUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_gallery(db, gallery_id, payload, request)


@router.patch("/{gallery_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def toggle_status(gallery_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, gallery_id, request)


@router.delete("/{gallery_id}", dependencies=[Depends(require_admin_permission(P.GALLERIES_DELETE))])
def destroy(gallery_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_gallery(db, gallery_id, request)


@router.post("/{gallery_id}/items/upload", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def upload_items(
    gallery_id: int,
    request: Request,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    return service.upload_items(db, gallery_id, files, request)


@router.post("/{gallery_id}/items/youtube", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def add_youtube(gallery_id: int, payload: GalleryYoutubeSchema, request: Request, db: Session = Depends(get_db)):
    return service.add_youtube(db, gallery_id, payload, request)


@router.post("/{gallery_id}/items/reorder", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def reorder_items(gallery_id: int, payload: ReorderSchema, request: Request, db: Session = Depends(get_db)):
    return service.reorder_items(db, gallery_id, payload, request)


@router.post(
    "/{gallery_id}/items/bulk-delete",
    dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))],
)
def bulk_delete_items(gallery_id: int, payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.bulk_delete_items(db, gallery_id, payload, request)


@router.put("/{gallery_id}/items/{item_id}", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def update_item(
    gallery_id: int, item_id: int, payload: GalleryItemUpdateSchema, request: Request, db: Session = Depends(get_db)
):
    return service.update_item(db, gallery_id, item_id, payload, request)


@router.delete("/{gallery_id}/items/{item_id}", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def destroy_item(gallery_id: int, item_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_item(db, gallery_id, item_id, request)


@router.post("/{gallery_id}/cover", dependencies=[Depends(require_admin_permission(P.GALLERIES_UPDATE))])
def set_cover(gallery_id: int, payload: GalleryCoverSchema, request: Request, db: Session = Depends(get_db)):
    return service.set_cover(db, gallery_id, payload, request)
