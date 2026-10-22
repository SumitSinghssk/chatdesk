from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import require_bulk_permission
from app.modules.admin.customers import service
from app.modules.admin.customers.schemas import CustomerCreateSchema, CustomerUpdateSchema
from app.shared.constants import permissions as P
from app.shared.enums import Status
from app.shared.utils.bulk import BulkActionSchema

router = APIRouter(prefix="/customers", tags=["Admin Customers"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Status | None = None,
    method: Literal["password", "otp", "google", "admin"] | None = None,
    whatsapp: Literal["connected", "error", "not_connected"] | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_customers(db, page, per_page, search, status.value if status else None, method,
                                  filters, match, sort, whatsapp)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_CREATE))])
def store(payload: CustomerCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_customer(db, payload, request)


@router.post("/bulk", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_UPDATE, P.CUSTOMERS_DELETE))])
def bulk(payload: BulkActionSchema, request: Request, db: Session = Depends(get_db)):
    require_bulk_permission(request, payload.action, P.CUSTOMERS_UPDATE, P.CUSTOMERS_DELETE)
    return service.bulk_action(db, payload, request)


@router.get("/{customer_id}", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_VIEW))])
def show(customer_id: int, db: Session = Depends(get_db)):
    return service.get_customer(db, customer_id)


@router.put("/{customer_id}", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_UPDATE))])
def update(customer_id: int, payload: CustomerUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_customer(db, customer_id, payload, request)


@router.patch("/{customer_id}/toggle-status", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_UPDATE))])
def toggle_status(customer_id: int, request: Request, db: Session = Depends(get_db)):
    return service.toggle_status(db, customer_id, request)


@router.post("/{customer_id}/sign-out", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_UPDATE))])
def sign_out(customer_id: int, request: Request, db: Session = Depends(get_db)):
    return service.revoke_sessions(db, customer_id, request)


@router.delete("/{customer_id}", dependencies=[Depends(require_admin_permission(P.CUSTOMERS_DELETE))])
def destroy(customer_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_customer(db, customer_id, request)
