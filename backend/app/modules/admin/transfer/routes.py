from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.admin.transfer import service

router = APIRouter(prefix="/transfer", tags=["Admin Transfer"])


@router.get("/{type_key}/export")
def export(type_key: str, request: Request, db: Session = Depends(get_db)):
    return service.export(db, type_key, request)


@router.get("/{type_key}/template")
def template(type_key: str, request: Request):
    return service.template(type_key, request)


@router.post("/{type_key}/preview")
def preview(type_key: str, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    return service.preview(db, type_key, file, request)


@router.post("/{type_key}/import")
def run_import(
    type_key: str,
    request: Request,
    token: str = Form(...),
    mode: str = Form("create"),
    db: Session = Depends(get_db),
):
    return service.run_import(db, type_key, token, mode, request)
