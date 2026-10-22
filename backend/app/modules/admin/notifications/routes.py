from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.admin.notifications import service
from app.modules.admin.users.models import User

router = APIRouter(prefix="/notifications", tags=["Admin Notifications"])


class NotificationBulkSchema(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)
    action: Literal["read", "unread", "delete"]


@router.get("/")
def index(
    page: int | None = None,
    per_page: int | None = None,
    unread: bool | None = None,
    search: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_notifications(db, user.id, page, per_page, unread, search, filters, match, sort)


@router.get("/latest")
def latest(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.latest(db, user.id)


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.stats(db, user.id)


@router.post("/mark-all-read")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.mark_all_read(db, user.id)


@router.post("/bulk")
def bulk(payload: NotificationBulkSchema, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.bulk(db, user.id, payload.ids, payload.action)


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.mark_read(db, user.id, notification_id)


@router.post("/{notification_id}/unread")
def mark_unread(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.mark_unread(db, user.id, notification_id)


@router.delete("/{notification_id}")
def destroy(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.delete_notification(db, user.id, notification_id)
