from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.website.enquiries import service
from app.modules.website.enquiries.schemas import ContactFormSchema

router = APIRouter(prefix="/enquiries")


@router.post("/", dependencies=[Depends(RateLimit(requests=5, window_seconds=60))])
def store(payload: ContactFormSchema, request: Request, db: Session = Depends(get_db)):
    return service.submit(db, payload, request)
