from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.activity_log import service
from app.shared.constants import permissions as P
from app.shared.pagination import OptionalId

router = APIRouter(prefix="/activity-logs", tags=["Admin Activity Logs"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.ACTIVITY_LOGS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    action: str | None = None,
    user_id: OptionalId = None,
    subject_type: str | None = None,
    subject_id: OptionalId = None,
    date_from: date | None = None,
    date_to: date | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_logs(db, page or 1, per_page, search, action, user_id, subject_type, date_from, date_to,
                             filters, match, sort, subject_id)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.ACTIVITY_LOGS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.delete("/clear", dependencies=[Depends(require_admin_permission(P.ACTIVITY_LOGS_CLEAR))])
def clear(request: Request, db: Session = Depends(get_db)):
    return service.clear_logs(db, request)


@router.get("/{log_id}", dependencies=[Depends(require_admin_permission(P.ACTIVITY_LOGS_VIEW))])
def show(log_id: int, db: Session = Depends(get_db)):
    return service.get_log(db, log_id)
