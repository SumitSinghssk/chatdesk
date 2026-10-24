from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.customer_auth import require_customer_csrf
from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.customer.account.models import Customer
from app.modules.customer.team.access import require_admin, require_workspace
from app.modules.customer.contacts import service, sheets
from app.modules.customer.contacts.schemas import BulkSchema, ContactSchema

router = APIRouter(prefix="/contacts", tags=["Customer Contacts"])
_csrf = Depends(require_customer_csrf)


@router.get("")
def index(page: int | None = None, per_page: int | None = None, search: str | None = None, tag: str | None = None,
          filters: str | None = None, match: Literal["and", "or"] = "and", sort: str | None = None,
          customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.list_contacts(db, customer, page, per_page, search, tag, filters, match, sort)


@router.get("/stats")
def stats(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.stats(db, customer)


@router.get("/attributes")
def attributes(customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.attribute_keys(db, customer)


@router.get("/export")
def export(search: str | None = None, tag: str | None = None, filters: str | None = None,
           match: Literal["and", "or"] = "and", sort: str | None = None,
           customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.export_csv(db, customer, search, tag, filters, match, sort)


@router.get("/import/sample")
def import_sample(format: Literal["xlsx", "csv"] = "xlsx", customer: Customer = Depends(require_admin)):
    return sheets.sample(format)


@router.post("/import/preview", dependencies=[Depends(RateLimit(60, 60)), _csrf])
def import_preview(file: UploadFile = File(...), mapping: str | None = Form(None), tag: str | None = Form(None),
                   update_existing: bool = Form(True), customer: Customer = Depends(require_admin),
                   db: Session = Depends(get_db)):
    return service.preview_import(db, customer, file, mapping, tag, update_existing)


@router.post("/import", dependencies=[Depends(RateLimit(10, 60)), _csrf])
def import_sheet(file: UploadFile = File(...), tag: str | None = Form(None), update_existing: bool = Form(True),
                 mapping: str | None = Form(None), customer: Customer = Depends(require_admin),
                 db: Session = Depends(get_db)):
    return service.import_sheet(db, customer, file, tag, update_existing, mapping)


@router.post("/bulk", dependencies=[_csrf])
def bulk(payload: BulkSchema, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.bulk(db, customer, payload)


@router.post("", dependencies=[_csrf])
def create(payload: ContactSchema, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.create_contact(db, customer, payload)


@router.get("/{contact_id}")
def show(contact_id: int, customer: Customer = Depends(require_workspace), db: Session = Depends(get_db)):
    return service.get_contact(db, customer, contact_id)


@router.put("/{contact_id}", dependencies=[_csrf])
def update(contact_id: int, payload: ContactSchema, customer: Customer = Depends(require_workspace),
           db: Session = Depends(get_db)):
    return service.update_contact(db, customer, contact_id, payload)


@router.delete("/{contact_id}", dependencies=[_csrf])
def delete(contact_id: int, customer: Customer = Depends(require_admin), db: Session = Depends(get_db)):
    return service.delete_contact(db, customer, contact_id)
