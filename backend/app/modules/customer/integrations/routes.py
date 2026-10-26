from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.integrations import service
from app.modules.customer.integrations.schemas import ApiKeySchema, EndpointSchema, TestEventSchema
from app.modules.customer.team.access import require_admin

router = APIRouter(prefix="/integrations", tags=["Customer Integrations"])
_csrf = Depends(require_customer_csrf)


@router.get("/keys")
def list_keys(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_keys(db, ws)


@router.post("/keys", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def create_key(payload: ApiKeySchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_key(db, ws, payload)


@router.delete("/keys/{key_id}", dependencies=[_csrf])
def delete_key(key_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_key(db, ws, key_id)


@router.get("/events")
def events(ws: Customer = Depends(require_admin)):
    return service.events()


@router.get("/webhooks")
def list_endpoints(ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_endpoints(db, ws)


@router.post("/webhooks", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def create_endpoint(payload: EndpointSchema, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_endpoint(db, ws, payload)


@router.get("/webhooks/{endpoint_id}")
def get_endpoint(endpoint_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_endpoint(db, ws, endpoint_id)


@router.put("/webhooks/{endpoint_id}", dependencies=[_csrf])
def update_endpoint(endpoint_id: int, payload: EndpointSchema, ws: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.update_endpoint(db, ws, endpoint_id, payload)


@router.delete("/webhooks/{endpoint_id}", dependencies=[_csrf])
def delete_endpoint(endpoint_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_endpoint(db, ws, endpoint_id)


@router.post("/webhooks/{endpoint_id}/secret", dependencies=[_csrf])
def roll_secret(endpoint_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.roll_secret(db, ws, endpoint_id)


@router.post("/webhooks/{endpoint_id}/test", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def send_test(endpoint_id: int, payload: TestEventSchema, ws: Customer = Depends(require_admin),
              db: Session = Depends(get_db)):
    return service.send_test(db, ws, endpoint_id, payload)


@router.get("/webhooks/{endpoint_id}/deliveries")
def list_deliveries(endpoint_id: int, status: str | None = None, page: int = Query(1, ge=1),
                    per_page: int = Query(25, ge=1, le=100), ws: Customer = Depends(require_admin),
                    db: Session = Depends(get_db)):
    return service.list_deliveries(db, ws, endpoint_id, status, page, per_page)


@router.get("/webhooks/{endpoint_id}/deliveries/{delivery_id}")
def get_delivery(endpoint_id: int, delivery_id: int, ws: Customer = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return service.get_delivery(db, ws, endpoint_id, delivery_id)


@router.post("/webhooks/{endpoint_id}/deliveries/{delivery_id}/resend",
             dependencies=[Depends(RateLimit(30, 60)), _csrf])
def resend(endpoint_id: int, delivery_id: int, ws: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.resend(db, ws, endpoint_id, delivery_id)
