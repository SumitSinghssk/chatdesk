from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.modules.admin.backups import service
from app.modules.admin.backups.schemas import BackupCreateSchema, BackupSettingsSchema
from app.shared.constants import permissions as P
from app.shared.utils.bulk import IdsSchema

router = APIRouter(prefix="/backups", tags=["Admin Backups"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.BACKUPS_VIEW))])
def index(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    filters: str | None = None,
    match: Literal["and", "or"] = "and",
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_backups(db, page, per_page, search, filters, match, sort)


@router.post("/", dependencies=[Depends(require_admin_permission(P.BACKUPS_CREATE))])
def store(payload: BackupCreateSchema, request: Request, db: Session = Depends(get_db)):
    return service.create_backup(db, payload, request)


@router.get("/stats", dependencies=[Depends(require_admin_permission(P.BACKUPS_VIEW))])
def stats(db: Session = Depends(get_db)):
    return service.stats(db)


@router.post("/bulk-delete", dependencies=[Depends(require_admin_permission(P.BACKUPS_DELETE))])
def bulk_delete(payload: IdsSchema, request: Request, db: Session = Depends(get_db)):
    return service.bulk_delete(db, payload.ids, request)


@router.get("/settings", dependencies=[Depends(require_admin_permission(P.BACKUPS_VIEW, P.BACKUPS_SETTINGS))])
def show_settings(db: Session = Depends(get_db)):
    return service.get_settings(db)


@router.put("/settings", dependencies=[Depends(require_admin_permission(P.BACKUPS_SETTINGS))])
def update_settings(payload: BackupSettingsSchema, request: Request, db: Session = Depends(get_db)):
    return service.update_settings(db, payload, request)


@router.get("/{backup_id}", dependencies=[Depends(require_admin_permission(P.BACKUPS_VIEW))])
def show(backup_id: int, db: Session = Depends(get_db)):
    return service.get_backup(db, backup_id)


@router.get("/{backup_id}/download/{file}", dependencies=[Depends(require_admin_permission(P.BACKUPS_DOWNLOAD))])
def download(backup_id: int, file: str, request: Request, db: Session = Depends(get_db)):
    return service.download(db, backup_id, file, request)


@router.delete("/{backup_id}", dependencies=[Depends(require_admin_permission(P.BACKUPS_DELETE))])
def destroy(backup_id: int, request: Request, db: Session = Depends(get_db)):
    return service.delete_backup(db, backup_id, request)
