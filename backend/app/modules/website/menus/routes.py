from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.admin.menus.models import MenuItem
from app.modules.admin.menus.service import build_tree, get_menu_by_key

router = APIRouter(prefix="/menus")


@router.get("/{key}")
def show(key: str, db: Session = Depends(get_db)):
    menu = get_menu_by_key(db, key)
    items = db.query(MenuItem).filter(MenuItem.menu_id == menu.id).all()
    return {"status": True, "data": {"key": menu.key, "name": menu.name, "items": build_tree(items, active_only=True)}}
