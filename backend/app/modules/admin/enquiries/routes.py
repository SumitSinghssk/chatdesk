from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_bulk_permission
from app.core.rate_limiter import RateLimit
from app.modules.admin.enquiries import service
from app.modules.admin.enquiries.schemas import (
    EnquiryAssignSchema,
    EnquiryBulkSchema,
    EnquiryCreateSchema,
    EnquiryFollowUpSchema,
    EnquiryNoteSchema,
    EnquiryReplySchema,
    EnquiryStatusSchema,
    EnquiryUpdateSchema,
)
from app.shared.constants import permissions as P

router = APIRouter(prefix="/enquiries", tags=["Admin Enquiries"])

StatusFilter = Literal["new", "in_progress", "replied", "on_hold", "closed", "spam", "open"]


@router.get("/", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_VIEW))])
def index(
    request: Request,
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: StatusFilter | None = None,
    source: str | None = None,
    assigned: str | None = None,
    follow_up: Literal["due", "upcoming", "none"] | None = None,
    seen: Literal["seen", "unseen"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    view: Literal["open", "follow_up", "mine", "all"] | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    user = get_current_user(request)
    return service.list_enquiries(db, user.id, page, per_page, search, status, source or None, assigned or None,
                                  follow_up, seen, date_from, date_to, view, filters, match, sort)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_VIEW))])
def stats(request: Request, db: Session = Depends(get_db)):
    return service.stats(db, get_current_user(request).id)


@router.get("/sources", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_VIEW))])
def sources(db: Session = Depends(get_db)):
    return service.sources(db)


@router.get("/assignees", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_VIEW))])
def assignees(db: Session = Depends(get_db)):
    return service.assignees(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_CREATE))])
def store(payload: EnquiryCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_enquiry(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE, P.ENQUIRIES_DELETE))])
def bulk(payload: EnquiryBulkSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.ENQUIRIES_UPDATE, P.ENQUIRIES_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{enquiry_id}", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_VIEW))])
def show(enquiry_id: int, db: Session = Depends(get_db)):
    return service.get_enquiry(db, enquiry_id)


@router.put("/{enquiry_id}", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def update(enquiry_id: int, payload: EnquiryUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_enquiry(db, enquiry_id, payload, request)


@router.post("/{enquiry_id}/status", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def change_status(enquiry_id: int, payload: EnquiryStatusSchema, request: Request, db: Session = Depends(get_db)):
    return service.change_status(db, enquiry_id, payload, request)


@router.post("/{enquiry_id}/notes", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def add_note(enquiry_id: int, payload: EnquiryNoteSchema, request: Request, db: Session = Depends(get_db)):
    return service.add_note(db, enquiry_id, payload, request)


@router.delete(
    "/{enquiry_id}/notes/{activity_id}", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))]
)
def delete_note(enquiry_id: int, activity_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_note(db, enquiry_id, activity_id, request)


@router.post("/{enquiry_id}/assign", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def assign(enquiry_id: int, payload: EnquiryAssignSchema, request: Request, db: Session = Depends(get_db)):
    return service.assign(db, enquiry_id, payload, request)


@router.post("/{enquiry_id}/follow-up", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def follow_up(enquiry_id: int, payload: EnquiryFollowUpSchema, request: Request, db: Session = Depends(get_db)):
    return service.set_follow_up(db, enquiry_id, payload, request)


@router.get("/{enquiry_id}/reply-draft", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE))])
def reply_draft(enquiry_id: int, request: Request, db: Session = Depends(get_db)):
    return service.reply_draft(db, enquiry_id, request)


@router.post(
    "/{enquiry_id}/reply",
    dependencies=[Depends(require_admin_permission(P.ENQUIRIES_UPDATE)), Depends(RateLimit(20, 60))],
)
def reply(enquiry_id: int, payload: EnquiryReplySchema, request: Request, db: Session = Depends(get_db)):
    return service.reply(db, enquiry_id, payload, request)


@router.delete("/{enquiry_id}", dependencies=[Depends(require_admin_permission(P.ENQUIRIES_DELETE))])
def destroy(enquiry_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_enquiry(db, enquiry_id, request)
