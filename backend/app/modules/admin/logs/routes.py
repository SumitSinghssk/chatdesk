from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.logs import service
from app.shared.constants import permissions as P

router = APIRouter(prefix="/logs", tags=["Admin Logs"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.LOGS_VIEW))])
def index():
    return service.list_files()


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.LOGS_VIEW))])
def stats():
    return service.stats()


@router.delete("/", dependencies=[Depends(require_admin_permission(P.LOGS_DELETE))])
def destroy_all(request: Request, db: Session = Depends(get_db)):
    return service.delete_all(db, request)


@router.get("/{name}", dependencies=[Depends(require_admin_permission(P.LOGS_VIEW))])
def show(name: str, lines: int = Query(service.DEFAULT_LINES, ge=1, le=service.MAX_LINES)):
    return service.read_file(name, lines)


@router.delete("/{name}", dependencies=[Depends(require_admin_permission(P.LOGS_DELETE))])
def destroy(name: str, request: Request, db: Session = Depends(get_db)):
    return service.delete_file(db, name, request)
