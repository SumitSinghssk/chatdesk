from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BeforeValidator
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.testimonials import service
from app.modules.admin.testimonials.schemas import TestimonialCreateSchema, TestimonialUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.pagination import OptionalId
from app.shared.utils.bulk import BulkActionSchema, ReorderSchema

router = APIRouter(prefix="/testimonials", tags=["Admin Testimonials"])

OptionalBool = Annotated[bool | None, BeforeValidator(lambda v: None if isinstance(v, str) and not v.strip() else v)]


@router.get("/", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    rating: OptionalId = None,
    featured: OptionalBool = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_testimonials(db, page, per_page, search, status.value if status else None, rating, featured,
                                     filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_CREATE))])
def store(payload: TestimonialCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_testimonial(db, payload, request)


@router.post(
    "/bulk",
    dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_UPDATE, P.TESTIMONIALS_DELETE))],
)
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.TESTIMONIALS_UPDATE, P.TESTIMONIALS_DELETE)
    return service.bulk_action(db, payload, request)


@router.post("/reorder", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_UPDATE))])
def reorder(payload: ReorderSchema, request: Request, db: Session = Depends(get_db)):
    return service.reorder(db, payload, request)


@router.get("/{testimonial_id}", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_VIEW))])
def show(testimonial_id: int, db: Session = Depends(get_db)):
    return service.get_testimonial(db, testimonial_id)


@router.put("/{testimonial_id}", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_UPDATE))])
def update(testimonial_id: int, payload: TestimonialUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_testimonial(db, testimonial_id, payload, request)


@router.patch(
    "/{testimonial_id}/toggle-status",
    dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_UPDATE))],
)
def toggle_status(testimonial_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, testimonial_id, request)


@router.delete("/{testimonial_id}", dependencies=[Depends(require_admin_permission(P.TESTIMONIALS_DELETE))])
def destroy(testimonial_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_testimonial(db, testimonial_id, request)
