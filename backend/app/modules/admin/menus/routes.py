from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.menus import service
from app.modules.admin.menus.schemas import MenuUpdateSchema
from app.shared.constants import permissions as P

router = APIRouter(prefix="/menus", tags=["Admin Menus"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.MENUS_VIEW))])
def index(db: Session = Depends(get_db)):
    return service.list_menus(db)


@router.get("/{key}", dependencies=[Depends(require_admin_permission(P.MENUS_VIEW))])
def show(key: str, db: Session = Depends(get_db)):
    return service.get_menu(db, key)


@router.put("/{key}", dependencies=[Depends(require_admin_permission(P.MENUS_UPDATE))])
def update(key: str, payload: MenuUpdateSchema, request: Request, db: Session = Depends(get_db)):
    return service.save_menu(db, key, payload, request)
