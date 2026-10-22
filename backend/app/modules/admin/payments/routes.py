from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.admin.payments import service
from app.modules.admin.payments.schemas import (
    ConfirmSchema, FailureSchema, GatewaySchema, PaymentSettingsSchema, TestCheckoutSchema,
)
from app.shared.constants import permissions as P

router = APIRouter(prefix="/payments", tags=["Admin Payments"])
_view = Depends(require_admin_permission(P.SETTINGS_VIEW))
_update = Depends(require_admin_permission(P.SETTINGS_UPDATE))


@router.get("/settings", dependencies=[_view])
def show(db: Session = Depends(get_db)):
    return service.show(db)


@router.put("/settings", dependencies=[_update])
def update(payload: PaymentSettingsSchema, request: Request, db: Session = Depends(get_db)):
    return service.update(db, payload, request)


@router.post("/test-connection", dependencies=[_update, Depends(RateLimit(10, 60))])
def test_connection(payload: GatewaySchema, request: Request, db: Session = Depends(get_db)):
    return service.test_connection(db, payload, request)


@router.post("/test-checkout", dependencies=[_update, Depends(RateLimit(10, 60))])
def test_checkout(payload: TestCheckoutSchema, request: Request, db: Session = Depends(get_db)):
    return service.test_checkout(db, payload, request)


@router.post("/confirm", dependencies=[_update])
def confirm(payload: ConfirmSchema, request: Request, db: Session = Depends(get_db)):
    return service.confirm(db, payload, request)


@router.post("/failed", dependencies=[_update])
def failed(payload: FailureSchema, db: Session = Depends(get_db)):
    return service.failed(db, payload)


@router.get("/transactions", dependencies=[_view])
def transactions(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    status: Literal["created", "paid", "failed", "refunded"] | None = None,
    db: Session = Depends(get_db),
):
    return service.transactions(db, page, per_page, search, status)


@router.get("/webhooks", dependencies=[_view])
def webhooks(
    page: int | None = None,
    per_page: int | None = None,
    status: Literal["processed", "ignored", "rejected", "received"] | None = None,
    db: Session = Depends(get_db),
):
    return service.webhooks(db, page, per_page, status)
