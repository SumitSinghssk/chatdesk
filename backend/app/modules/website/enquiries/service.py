import logging
import time

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.enquiries.models import Enquiry, EnquiryActivity
from app.modules.admin.notifications.service import notify_admins
from app.modules.website.enquiries.schemas import ContactFormSchema
from app.shared.constants import permissions as P
from app.shared.enums import EnquiryStatus
from app.shared.constants import admin_urls as urls
from app.shared.constants.admin_urls import admin_url

logger = logging.getLogger(__name__)

THANK_YOU = {"status": True, "message": "Thanks! We'll get back to you soon."}
MIN_FILL_SECONDS = 2
MAX_FILL_SECONDS = 7 * 24 * 3600


def _looks_like_bot(payload: ContactFormSchema) -> bool:
    if payload.website:
        return True
    if not payload.started_at or payload.started_at <= 0:
        return True
    elapsed = time.time() - payload.started_at / 1000
    return not (MIN_FILL_SECONDS <= elapsed <= MAX_FILL_SECONDS)


def submit(db: Session, payload: ContactFormSchema, request: Request):
    if _looks_like_bot(payload):
        logger.info("Contact form submission dropped as bot (%s)", payload.email or payload.phone)
        return THANK_YOU

    enquiry = Enquiry(
        source="website",
        source_url=payload.source_url,
        name=payload.name.strip(),
        email=str(payload.email).lower() if payload.email else None,
        phone=payload.phone,
        company=payload.company,
        subject=payload.subject,
        message=payload.message.strip(),
        status=EnquiryStatus.NEW.value,
    )
    db.add(enquiry)
    db.flush()
    db.add(EnquiryActivity(enquiry_id=enquiry.id, type="created", body="Submitted via website contact form"))
    notify_admins(
        db,
        permission=P.ENQUIRIES_VIEW,
        type="enquiry.new",
        title="New enquiry",
        message=f"{enquiry.name}: {enquiry.subject or enquiry.message[:80]}",
        url=admin_url(urls.ENQUIRIES, enquiry=enquiry.id),
    )
    log_activity(db, "created", request=request, subject_type="enquiry", subject_id=enquiry.id,
                 subject_label=enquiry.name, description="Enquiry submitted from website")
    db.commit()
    return THANK_YOU
