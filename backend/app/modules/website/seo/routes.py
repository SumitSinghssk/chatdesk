from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.website.seo import service

router = APIRouter(prefix="/seo")


@router.get("/by-path")
def by_path(path: str = "/", db: Session = Depends(get_db)):
    return service.by_path(db, path)
