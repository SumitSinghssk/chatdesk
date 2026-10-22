from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.admin.search import service

router = APIRouter(prefix="/search", tags=["Admin Search"])


@router.get("/")
def index(request: Request, q: str | None = None, db: Session = Depends(get_db)):
    return service.search(db, request, q)
