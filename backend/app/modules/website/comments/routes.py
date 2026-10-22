from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limiter import RateLimit
from app.modules.website.comments import service
from app.modules.website.comments.schemas import CommentSubmitSchema

router = APIRouter(prefix="/blogs/{slug}/comments")


@router.get("")
def index(slug: str, db: Session = Depends(get_db)):
    return service.list_comments(db, slug)


@router.post("", dependencies=[Depends(RateLimit(requests=5, window_seconds=60))])
def store(slug: str, payload: CommentSubmitSchema, request: Request, db: Session = Depends(get_db)):
    return service.submit(db, slug, payload, request)
