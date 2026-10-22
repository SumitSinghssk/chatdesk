from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.admin.team_members.service import public_members

router = APIRouter(prefix="/team")


@router.get("")
def index(department: str | None = None, featured: bool | None = None, db: Session = Depends(get_db)):
    return {"status": True, "data": public_members(db, department, featured)}
