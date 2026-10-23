from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.automation import service
from app.modules.customer.automation.schemas import OrderSchema, RuleSchema, SettingsSchema, TryMessageSchema
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/automation", tags=["Customer Automation"])
_csrf = Depends(require_customer_csrf)


@router.get("/rules")
def rules(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_rules(db, ws)


@router.post("/rules", dependencies=[_csrf])
def create(payload: RuleSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_rule(db, ws, payload)


@router.put("/rules/order", dependencies=[_csrf])
def reorder(payload: OrderSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.reorder(db, ws, payload)


@router.put("/rules/{rule_id}", dependencies=[_csrf])
def update(rule_id: int, payload: RuleSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.update_rule(db, ws, rule_id, payload)


@router.put("/rules/{rule_id}/active", dependencies=[_csrf])
def set_active(rule_id: int, active: bool = Body(..., embed=True), ws: Customer = Depends(require_admin),
               db: Session = Depends(get_db)):
    return service.set_active(db, ws, rule_id, active)


@router.delete("/rules/{rule_id}", dependencies=[_csrf])
def delete(rule_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_rule(db, ws, rule_id)


@router.get("/settings")
def get_settings(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_settings(db, ws)


@router.put("/settings", dependencies=[_csrf])
def save_settings(payload: SettingsSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.save_settings(db, ws, payload)


@router.post("/try", dependencies=[Depends(RateLimit(120, 60)), _csrf])
def try_message(payload: TryMessageSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.try_message(db, ws, payload)
