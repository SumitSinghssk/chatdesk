from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.team.access import require_admin
from app.modules.customer.campaigns import service
from app.modules.customer.campaigns.schemas import CampaignSchema, PreviewSchema, TestSendSchema

router = APIRouter(prefix="/campaigns", tags=["Customer Campaigns"])
_csrf = Depends(require_customer_csrf)


@router.get("")
def index(page: int | None = None, per_page: int | None = None, search: str | None = None, status: str | None = None,
          filters: str | None = None, match: Literal["and", "or"] = "and", sort: str | None = None,
          customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.list_campaigns(db, customer, page, per_page, search, status, filters, match, sort)


@router.get("/stats")
def stats(customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.stats(db, customer)


@router.post("/preview", dependencies=[Depends(RateLimit(60, 60)), _csrf])
def preview(payload: PreviewSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.preview(db, customer, payload)


@router.post("/test", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def test(payload: TestSendSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.send_test(db, customer, payload)


@router.post("", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def create(payload: CampaignSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.create_campaign(db, customer, payload)


@router.get("/{campaign_id}")
def show(campaign_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.get_campaign(db, customer, campaign_id)


@router.put("/{campaign_id}", dependencies=[_csrf])
def update(campaign_id: int, payload: CampaignSchema, customer: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.update_campaign(db, customer, campaign_id, payload)


@router.post("/{campaign_id}/{action}", dependencies=[_csrf])
def control(campaign_id: int, action: Literal["pause", "resume", "cancel"],
            customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.control(db, customer, campaign_id, action)


@router.get("/{campaign_id}/recipients")
def recipients(campaign_id: int, page: int | None = None, per_page: int | None = None, status: str | None = None,
               search: str | None = None, customer: Customer = Depends(require_admin),
               db: Session = Depends(get_db)):
    return service.list_recipients(db, customer, campaign_id, page, per_page, status, search)


@router.get("/{campaign_id}/segments")
def segments(campaign_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.segment_counts(db, customer, campaign_id)


@router.get("/{campaign_id}/recipients/export")
def export(campaign_id: int, status: str | None = None, customer: Customer = Depends(require_admin),
           db: Session = Depends(get_db)):
    return service.export_recipients(db, customer, campaign_id, status)


@router.delete("/{campaign_id}", dependencies=[_csrf])
def delete(campaign_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_campaign(db, customer, campaign_id)
