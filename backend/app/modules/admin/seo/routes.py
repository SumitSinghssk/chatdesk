from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.seo import service
from app.modules.admin.seo.schemas import SeoPageCreateSchema, SeoPageUpdateSchema
from app.shared.constants import permissions as P
from app.shared.utils.bulk import IdsSchema

router = APIRouter(prefix="/seo", tags=["Admin SEO"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.SEO_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    indexing: Literal["yes", "no"] | None = None,
    path: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_seo(db, page, per_page, search, indexing, path, filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.SEO_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.SEO_CREATE))])
def store(payload: SeoPageCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_seo(db, payload, request)


@router.post("/bulk-delete", dependencies=[Depends(require_admin_permission(P.SEO_DELETE))])
def bulk_delete(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.bulk_delete(db, payload, request)


@router.get("/{seo_id}", dependencies=[Depends(require_admin_permission(P.SEO_VIEW))])
def show(seo_id: int, db: Session = Depends(get_db)):
    return service.get_seo(db, seo_id)


@router.put("/{seo_id}", dependencies=[Depends(require_admin_permission(P.SEO_UPDATE))])
def update(seo_id: int, payload: SeoPageUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_seo(db, seo_id, payload, request)


@router.delete("/{seo_id}", dependencies=[Depends(require_admin_permission(P.SEO_DELETE))])
def destroy(seo_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_seo(db, seo_id, request)
