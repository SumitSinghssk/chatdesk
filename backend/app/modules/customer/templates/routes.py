from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer, require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.templates import service
from app.modules.customer.templates.schemas import TemplateSchema

router = APIRouter(prefix="/templates", tags=["Customer Templates"])
_csrf = Depends(require_customer_csrf)
# Meta allows 100 new templates an hour per account; this keeps a stuck "Submit" button from hitting it
_submit_limit = Depends(RateLimit(30, 60))


@router.get("")
def index(page: int | None = None, per_page: int | None = None, search: str | None = None, status: str | None = None,
          filters: str | None = None, match: Literal["and", "or"] = "and", sort: str | None = None,
          customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.list_templates(db, customer, page, per_page, search, status, filters, match, sort)


@router.get("/stats")
def stats(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.stats(db, customer)


@router.post("/sync", dependencies=[Depends(RateLimit(20, 60)), _csrf])
def sync(auto: bool = False, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.auto_sync(db, customer) if auto else service.sync(db, customer)


@router.post("/media", dependencies=[Depends(RateLimit(30, 60)), _csrf])
def upload_media(file: UploadFile = File(...), kind: Literal["image", "video", "document"] = Form(...),
                 customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.upload_sample(db, customer, file, kind)


@router.get("/media/{key}")
def media(key: str, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.sample_file(db, customer, key)


@router.post("", dependencies=[_submit_limit, _csrf])
def create(payload: TemplateSchema, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.save_template(db, customer, payload)


@router.get("/{template_id}")
def show(template_id: int, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.get_template(db, customer, template_id)


@router.get("/{template_id}/sample")
def sample(template_id: int, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.template_sample(db, customer, template_id)


@router.put("/{template_id}", dependencies=[_submit_limit, _csrf])
def update(template_id: int, payload: TemplateSchema, customer: Customer = Depends(require_customer),
           db: Session = Depends(get_db)):
    return service.save_template(db, customer, payload, template_id)


@router.delete("/{template_id}", dependencies=[_csrf])
def delete(template_id: int, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)):
    return service.delete_template(db, customer, template_id)
