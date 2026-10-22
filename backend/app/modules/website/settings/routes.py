from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.admin.settings.service import get_group, public_settings

router = APIRouter(prefix="/settings")


@router.get("/")
def index(db: Session = Depends(get_db)):
    return public_settings(db)


@router.get("/robots")
def robots(db: Session = Depends(get_db)):
    return {"status": True, "data": {"content": get_group(db, "robots")["content"]}}
