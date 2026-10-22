import json

from fastapi import HTTPException, Request, status
from sqlalchemy import String, and_, case, cast, func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.seo.models import DEFAULT_SEO_PATH, SeoPage
from app.modules.admin.seo.schemas import SeoPageCreateSchema, SeoPageUpdateSchema
from app.shared.pagination import list_response
from app.shared.utils.bulk import IdsSchema
from app.shared.utils.datetime import iso
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.slug import normalize_path

SUBJECT = "seo_page"
FIELDS = ("page", "path", "meta_title", "meta_description", "meta_keywords", "og_image", "canonical_url",
          "schema_markup", "header_scripts", "footer_scripts", "custom_css", "faqs", "allow_indexing")
SCRIPT_FIELDS = ("header_scripts", "footer_scripts", "custom_css", "schema_markup")
SCRIPTS_ONLY_SUPER_ADMIN = "Only a super admin can change scripts and custom CSS"


def _serialize(row: SeoPage) -> dict:
    return {
        "id": row.id,
        **{field: getattr(row, field) for field in FIELDS},
        "faqs": row.faqs or [],
        "is_default": row.path == DEFAULT_SEO_PATH,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: SeoPage) -> dict:
    return {field: getattr(row, field) for field in FIELDS}


def _label(row: SeoPage) -> str:
    return f"{row.page} ({row.path})"


def _get_or_404(db: Session, seo_id: int) -> SeoPage:
    row = db.query(SeoPage).filter(SeoPage.id == seo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SEO entry not found")
    return row


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def clean_path(value: str | None) -> str:
    value = (value or "").strip()
    if value == DEFAULT_SEO_PATH:
        return value
    value = value.split("#", 1)[0].split("?", 1)[0]
    return normalize_path(value)


def _guard_scripts(data: dict, row: SeoPage | None, actor) -> None:
    if actor is None or actor.is_super_admin:
        return
    for field in SCRIPT_FIELDS:
        stored = getattr(row, field) if row is not None else None
        if (data.get(field) or "") != (stored or ""):
            raise _field_error(field, SCRIPTS_ONLY_SUPER_ADMIN)


def _prepare(db: Session, payload, row: SeoPage | None = None, actor=None) -> dict:
    data = payload.model_dump()
    _guard_scripts(data, row, actor)
    data["path"] = clean_path(payload.path)
    if data["path"] != DEFAULT_SEO_PATH and not data["path"].startswith("/"):
        raise _field_error("path", "Path must start with / (or be * for the site-wide default)")
    if row is not None and row.path == DEFAULT_SEO_PATH and data["path"] != DEFAULT_SEO_PATH:
        raise _field_error("path", "The path of the default (*) entry can't be changed")

    taken = db.query(SeoPage.id).filter(SeoPage.path == data["path"])
    if row is not None:
        taken = taken.filter(SeoPage.id != row.id)
    if db.query(taken.exists()).scalar():
        raise _field_error("path", "SEO settings for this path already exist")

    if data.get("schema_markup"):
        try:
            json.loads(data["schema_markup"])
        except ValueError:
            raise _field_error("schema_markup", "Schema must be valid JSON-LD")
    data["faqs"] = data.get("faqs") or None
    return data


HAS_FAQS = and_(SeoPage.faqs.isnot(None), cast(SeoPage.faqs, String).notin_(["null", "[]"]))
MISSING_DESCRIPTION = or_(SeoPage.meta_description.is_(None), func.trim(SeoPage.meta_description) == "")
MISSING_TITLE = or_(SeoPage.meta_title.is_(None), func.trim(SeoPage.meta_title) == "")

GRID_FIELDS = {
    "page": GridField(SeoPage.page, "text"),
    "path": GridField(SeoPage.path, "text"),
    "meta_title": GridField(SeoPage.meta_title, "text"),
    "meta_description": GridField(SeoPage.meta_description, "text"),
    "meta_keywords": GridField(SeoPage.meta_keywords, "text", sortable=False),
    "canonical_url": GridField(SeoPage.canonical_url, "text"),
    "og_image": GridField(SeoPage.og_image, "text", sortable=False),
    "allow_indexing": GridField(SeoPage.allow_indexing, "bool"),
    "faqs": GridField(HAS_FAQS, "bool", sortable=False),
    "created_at": GridField(SeoPage.created_at, "date"),
    "updated_at": GridField(SeoPage.updated_at, "date"),
}


def list_seo(db: Session, page=None, per_page=None, search=None, indexing=None, path=None,
             filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = db.query(SeoPage)
    if path:
        q = q.filter(SeoPage.path == clean_path(path))
    clause = search_clause([SeoPage.page, SeoPage.path, SeoPage.meta_title], search)
    if clause is not None:
        q = q.filter(clause)
    if indexing == "yes":
        q = q.filter(SeoPage.allow_indexing.is_(True))
    elif indexing == "no":
        q = q.filter(SeoPage.allow_indexing.is_(False))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = q.order_by(case((SeoPage.path == DEFAULT_SEO_PATH, 0), else_=1))
    q = apply_sort(q, GRID_FIELDS, sort, [SeoPage.path.asc()])
    return list_response(q, _serialize, page, per_page, search)


def stats(db: Session):
    def count(*filters) -> int:
        return db.query(func.count(SeoPage.id)).filter(*filters).scalar() or 0

    total = count()
    indexable = count(SeoPage.allow_indexing.is_(True))
    return {
        "status": True,
        "data": {
            "total": total,
            "indexable": indexable,
            "noindex": total - indexable,
            "missing_description": count(MISSING_DESCRIPTION),
            "missing_title": count(MISSING_TITLE),
            "with_faqs": count(HAS_FAQS),
            "has_default": count(SeoPage.path == DEFAULT_SEO_PATH) > 0,
        },
    }


def get_seo(db: Session, seo_id: int):
    return {"status": True, "data": _serialize(_get_or_404(db, seo_id))}


def create_seo(db: Session, payload: SeoPageCreateSchema, request: Request):
    row = SeoPage(**_prepare(db, payload, actor=get_current_user(request)))
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "SEO entry created", "data": _serialize(_get_or_404(db, row.id))}


def update_seo(db: Session, seo_id: int, payload: SeoPageUpdateSchema, request: Request):
    row = _get_or_404(db, seo_id)
    before = _snapshot(row)
    for key, value in _prepare(db, payload, row, get_current_user(request)).items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "SEO entry updated", "data": _serialize(_get_or_404(db, row.id))}


def delete_seo(db: Session, seo_id: int, request: Request):
    row = _get_or_404(db, seo_id)
    if row.path == DEFAULT_SEO_PATH:
        raise HTTPException(status_code=400, detail="The default (*) SEO entry can't be deleted")
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), old_values=_snapshot(row))
    db.delete(row)
    db.commit()
    return {"status": True, "message": "SEO entry deleted"}


def bulk_delete(db: Session, payload: IdsSchema, request: Request):
    rows = db.query(SeoPage).filter(SeoPage.id.in_(payload.ids), SeoPage.path != DEFAULT_SEO_PATH).all()
    ids = [r.id for r in rows]
    for row in rows:
        db.delete(row)
    for row in rows:
        log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=_label(row), description="Deleted in a bulk action", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": f"{len(ids)} SEO entries deleted"}
