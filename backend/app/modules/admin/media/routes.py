from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.media import service
from app.modules.admin.media.schemas import MediaType, MediaUpdateSchema
from app.shared.constants import permissions as P
from app.shared.utils.bulk import IdsSchema

router = APIRouter(prefix="/media", tags=["Admin Media"])

UPLOAD_PERMISSIONS = (
    P.MEDIA_UPLOAD,
    P.BLOGS_CREATE, P.BLOGS_UPDATE,
    P.PAGES_CREATE, P.PAGES_UPDATE,
    P.TESTIMONIALS_CREATE, P.TESTIMONIALS_UPDATE,
    P.GALLERIES_CREATE, P.GALLERIES_UPDATE,
    P.BLOG_CATEGORIES_CREATE, P.BLOG_CATEGORIES_UPDATE,
    P.SEO_CREATE, P.SEO_UPDATE,
    P.SETTINGS_UPDATE,
)


@router.get("/", dependencies=[Depends(require_admin_permission(P.MEDIA_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    folder: str | None = None,
    type: MediaType | None = None,
    sort: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    db: Session = Depends(get_db),
):
    return service.list_media(db, page, per_page, search, folder or None, type, sort or None, filters, match)


@router.get("/folders", dependencies=[Depends(require_admin_permission(P.MEDIA_VIEW))])
def folders(db: Session = Depends(get_db)):
    return service.folders(db)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.MEDIA_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(*UPLOAD_PERMISSIONS))])
def store(
    request: Request,
    file: UploadFile = File(...),
    folder: str = Form("general"),
    alt: str | None = Form(None),
    db: Session = Depends(get_db),
):
    return service.upload(db, file, folder, alt, request)


@router.post("/bulk-delete", dependencies=[Depends(require_admin_permission(P.MEDIA_DELETE))])
def bulk_delete(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.bulk_delete(db, payload, request)


@router.get("/{media_id}", dependencies=[Depends(require_admin_permission(P.MEDIA_VIEW))])
def show(media_id: int, db: Session = Depends(get_db)):
    return service.get_media(db, media_id)


@router.put("/{media_id}", dependencies=[Depends(require_admin_permission(P.MEDIA_UPLOAD))])
def update(media_id: int, payload: MediaUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_media(db, media_id, payload, request)


@router.delete("/{media_id}", dependencies=[Depends(require_admin_permission(P.MEDIA_DELETE))])
def destroy(media_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_media(db, media_id, request)
