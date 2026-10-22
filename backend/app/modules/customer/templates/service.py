import mimetypes
import re
import shutil
import time
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR
from app.core.crypto import decrypt_secret
from app.modules.customer.account.models import Customer
from app.modules.customer.auth.service import field_error
from app.modules.customer.inbox.models import WaMessage
from app.modules.customer.templates import builder
from app.modules.customer.templates.models import WaTemplate
from app.modules.customer.templates.schemas import TemplateSchema
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.services.whatsapp import MEDIA_LIMITS, WhatsAppClient, WhatsAppError
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause

SAMPLE_DIR = STORAGE_DIR / "whatsapp-media" / "templates"
# What Meta accepts as a header sample, per header type
SAMPLE_TYPES = {
    "image": {"image/jpeg", "image/png"},
    "video": {"video/mp4"},
    "document": {"application/pdf"},
}
SAMPLE_KEY = re.compile(r"^[a-f0-9]{32}\.[a-z0-9]{2,5}$")
COPY_KEY = re.compile(r"^template:(\d+)$")
EDITABLE = {"approved", "rejected", "paused"}  # Meta lets these be edited (they go back into review)
IN_REVIEW = {"pending", "in_appeal", "pending_deletion"}
SYNC_EVERY = 300  # seconds between automatic syncs with Meta
SYNC_PENDING_EVERY = 30  # ...or sooner while a template waits for Meta's decision
MEDIA_ID_DAYS = 25  # Meta keeps uploaded media 30 days; re-upload a little before that
_last_sync: dict[int, float] = {}
_last_error: dict[int, str] = {}  # why the last automatic sync failed (shown until one succeeds)

GRID_FIELDS = {
    "name": GridField(WaTemplate.name, "text"),
    "category": GridField(WaTemplate.category, "enum"),
    "language": GridField(WaTemplate.language, "enum"),
    "status": GridField(WaTemplate.status, "enum"),
    "quality": GridField(WaTemplate.quality, "enum"),
    "source": GridField(WaTemplate.source, "enum"),
    "created_at": GridField(WaTemplate.created_at, "date"),
    "updated_at": GridField(WaTemplate.updated_at, "date"),
}


# Helpers -----------------------------------------------------------------------------

def _connected(db: Session, customer: Customer) -> WhatsAppAccount | None:
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.customer_id == customer.id).first()
    return account if account and account.status == "connected" else None


def client_for(db: Session, customer: Customer) -> tuple[WhatsAppAccount, WhatsAppClient]:
    account = _connected(db, customer)
    if account is None:
        raise HTTPException(422, detail="Connect a working WhatsApp number in WhatsApp setup first")
    return account, WhatsAppClient(account.phone_number_id, decrypt_secret(account.access_token) or "")


def _get(db: Session, customer: Customer, template_id: int) -> WaTemplate:
    template = db.query(WaTemplate).filter(WaTemplate.id == template_id,
                                           WaTemplate.customer_id == customer.id).first()
    if template is None:
        raise HTTPException(404, detail="Template not found")
    return template


def form_of(template: WaTemplate) -> dict:
    return builder.parse(template.components or [], template.category, template.parameter_format)


def _message_stats(db: Session, customer: Customer, names: list[str]) -> dict[str, dict]:
    if not names:
        return {}
    rows = (db.query(
        WaMessage.template_name,
        func.count(WaMessage.id),
        func.sum(case((WaMessage.status.in_(("delivered", "read")), 1), else_=0)),
        func.sum(case((WaMessage.status == "read", 1), else_=0)),
        func.sum(case((WaMessage.status == "failed", 1), else_=0)),
        func.max(WaMessage.created_at),
    ).filter(WaMessage.customer_id == customer.id, WaMessage.type == "template",
             WaMessage.template_name.in_(names))
        .group_by(WaMessage.template_name).all())
    return {name: {"sent": total, "delivered": int(delivered or 0), "read": int(read or 0),
                   "failed": int(failed or 0), "last_sent_at": iso(last)}
            for name, total, delivered, read, failed, last in rows}


EMPTY_STATS = {"sent": 0, "delivered": 0, "read": 0, "failed": 0, "last_sent_at": None}


def serialize(template: WaTemplate, stats: dict | None = None) -> dict:
    form = form_of(template)
    has_sample = bool(template.sample_key or form.get("media_url"))
    return {
        "id": template.id,
        "meta_id": template.meta_id,
        "name": template.name,
        "language": template.language,
        "category": template.category,
        "parameter_format": template.parameter_format,
        "status": template.status,
        "rejected_reason": template.rejected_reason,
        "quality": template.quality,
        "source": template.source,
        "form": form,
        "params": builder.send_params(form),
        "editable": form["supported"] and (template.status == "draft" or template.status in EDITABLE),
        "sample": {
            "path": f"/customer/templates/{template.id}/sample",
            "mime": template.sample_mime,
            "filename": template.sample_filename,
            "size": template.sample_size,
        } if has_sample and form["header"]["format"] in builder.MEDIA_FORMATS else None,
        "stats": stats or EMPTY_STATS,
        "submitted_at": iso(template.submitted_at),
        "status_changed_at": iso(template.status_changed_at),
        "synced_at": iso(template.synced_at),
        "created_at": iso(template.created_at),
        "updated_at": iso(template.updated_at),
    }


# List & stats ------------------------------------------------------------------------

def list_templates(db: Session, customer: Customer, page=None, per_page=None, search=None, status=None,
                   filters=None, match="and", sort=None) -> dict:
    q = db.query(WaTemplate).filter(WaTemplate.customer_id == customer.id)
    clause = search_clause([WaTemplate.name, WaTemplate.components], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(WaTemplate.status.in_(status.split(",")))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [WaTemplate.updated_at.desc(), WaTemplate.id.desc()])
    result = list_response(q, lambda t: t, page, per_page, search)
    rows: list[WaTemplate] = result["data"]
    stats = _message_stats(db, customer, list({t.name for t in rows}))
    result["data"] = [serialize(t, stats.get(t.name)) for t in rows]
    return result


def stats(db: Session, customer: Customer) -> dict:
    counts = dict(db.query(WaTemplate.status, func.count(WaTemplate.id))
                  .filter(WaTemplate.customer_id == customer.id).group_by(WaTemplate.status).all())
    languages = [lang for (lang,) in db.query(WaTemplate.language).filter(WaTemplate.customer_id == customer.id)
                 .distinct().order_by(WaTemplate.language).all()]
    account = _connected(db, customer)
    last = db.query(func.max(WaTemplate.synced_at)).filter(WaTemplate.customer_id == customer.id).scalar()
    return {"status": True, "data": {
        "total": sum(counts.values()),
        "approved": counts.get("approved", 0),
        "pending": sum(counts.get(s, 0) for s in IN_REVIEW),
        "rejected": counts.get("rejected", 0),
        "paused": counts.get("paused", 0) + counts.get("disabled", 0),
        "draft": counts.get("draft", 0),
        "languages": languages,
        "connected": account is not None,
        "synced_at": iso(last),
    }}


def get_template(db: Session, customer: Customer, template_id: int) -> dict:
    template = _get(db, customer, template_id)
    return {"status": True, "data": serialize(template, _message_stats(db, customer, [template.name]).get(template.name))}


# Sync with Meta ----------------------------------------------------------------------

def _status_of(raw: str | None) -> str:
    return (raw or "PENDING").lower()


def sync(db: Session, customer: Customer) -> dict:
    """Copies every template from the WhatsApp Business Account (made here or in WhatsApp Manager)."""
    account, client = client_for(db, customer)
    try:
        raw = client.templates(account.waba_id)
    except WhatsAppError as exc:
        raise HTTPException(422, detail=f"Couldn't load templates from Meta: {exc.details or exc}") from exc
    existing = {(t.name, t.language): t for t in db.query(WaTemplate).filter(WaTemplate.customer_id == customer.id)}
    seen, changes, added = set(), [], 0
    stamp = now()
    for item in raw:
        key = (item.get("name"), item.get("language"))
        if not all(key):
            continue
        seen.add(key)
        template = existing.get(key)
        status = _status_of(item.get("status"))
        if template is None:
            template = WaTemplate(customer_id=customer.id, name=key[0], language=key[1], source="meta",
                                  status_changed_at=stamp)
            db.add(template)
            added += 1
        elif template.status != status:
            if template.status != "draft":
                changes.append({"id": template.id, "name": template.name, "status": status})
            template.status_changed_at = stamp
        reason = item.get("rejected_reason")
        template.meta_id = str(item.get("id") or template.meta_id or "") or None
        template.status = status
        template.category = (item.get("category") or template.category or "marketing").lower()
        template.parameter_format = (item.get("parameter_format") or "POSITIONAL").lower()
        template.rejected_reason = None if not reason or reason == "NONE" else reason
        template.quality = (item.get("quality_score") or {}).get("score") or template.quality
        template.components = item.get("components") or []
        template.synced_at = stamp
    removed = 0
    for key, template in existing.items():
        # gone from Meta (deleted in WhatsApp Manager); local drafts stay
        if key not in seen and template.meta_id and template.status != "draft":
            _remove_sample(db, template)
            db.delete(template)
            removed += 1
    db.commit()
    _last_sync[account.id] = time.monotonic()
    parts = [f"{len(seen)} template{'s' if len(seen) != 1 else ''} on Meta"]
    if added:
        parts.append(f"{added} new")
    if changes:
        parts.append(f"{len(changes)} updated")
    if removed:
        parts.append(f"{removed} removed")
    return {"status": True, "message": "Synced: " + ", ".join(parts),
            "data": {"total": len(seen), "added": added, "removed": removed, "changes": changes}}


def auto_sync(db: Session, customer: Customer) -> dict:
    """Syncs when the copy is stale. Never fails the page: errors come back as `error`."""
    account = _connected(db, customer)
    if account is None:
        return {"status": True, "data": {"synced": False, "error": None, "changes": []}}
    waiting = db.query(WaTemplate.id).filter(WaTemplate.customer_id == customer.id,
                                             WaTemplate.status.in_(IN_REVIEW)).first() is not None
    last = _last_sync.get(account.id)
    if last is not None and time.monotonic() - last < (SYNC_PENDING_EVERY if waiting else SYNC_EVERY):
        return {"status": True, "data": {"synced": False, "error": _last_error.get(account.id), "changes": []}}
    try:
        result = sync(db, customer)["data"]
    except HTTPException as exc:
        _last_sync[account.id] = time.monotonic()  # don't hammer Meta while the token is broken
        _last_error[account.id] = str(exc.detail)
        return {"status": True, "data": {"synced": False, "error": _last_error[account.id], "changes": []}}
    _last_error.pop(account.id, None)
    return {"status": True, "data": {"synced": True, "error": None, **result}}


# Header samples ----------------------------------------------------------------------

def _sample_path(customer_id: int, key: str) -> Path:
    return SAMPLE_DIR / str(customer_id) / key


def upload_sample(db: Session, customer: Customer, file: UploadFile, kind: str) -> dict:
    allowed = SAMPLE_TYPES.get(kind)
    if allowed is None:
        raise field_error(422, "file", "Samples are only for image, video and document headers")
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in allowed:
        names = {"image": "a JPG or PNG image", "video": "an MP4 video", "document": "a PDF"}
        raise field_error(422, "file", f"Upload {names[kind]}")
    content = file.file.read(MEDIA_LIMITS[kind] + 1)
    if not content:
        raise field_error(422, "file", "The file is empty")
    if len(content) > MEDIA_LIMITS[kind]:
        raise field_error(422, "file", f"The file is over {MEDIA_LIMITS[kind] // (1024 * 1024)} MB")
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "video/mp4": ".mp4", "application/pdf": ".pdf"}[mime]
    key = f"{uuid.uuid4().hex}{ext}"
    path = _sample_path(customer.id, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return {"status": True, "data": {"key": key, "mime": mime, "filename": file.filename or key,
                                     "size": len(content), "path": f"/customer/templates/media/{key}"}}


def sample_file(db: Session, customer: Customer, key: str) -> FileResponse:
    path = _sample_path(customer.id, key)
    if not SAMPLE_KEY.match(key) or not path.exists():
        raise HTTPException(404, detail="File not found")
    return FileResponse(path, media_type=mimetypes.guess_type(key)[0] or "application/octet-stream",
                        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})


def _ensure_sample(db: Session, customer: Customer, template: WaTemplate) -> Path | None:
    """The template's header sample on disk; templates made in WhatsApp Manager are fetched once."""
    if template.sample_key:
        path = _sample_path(customer.id, template.sample_key)
        if path.exists():
            return path
    url = form_of(template).get("media_url")
    if not url:
        return None
    _, client = client_for(db, customer)
    try:
        content, mime = client.fetch_url(url)
    except WhatsAppError:
        return None
    mime = mime if mime != "application/octet-stream" else (mimetypes.guess_type(url.split("?")[0])[0] or mime)
    ext = mimetypes.guess_extension(mime) or ".bin"
    ext = {".jpe": ".jpg", ".jpeg": ".jpg"}.get(ext, ext)
    key = f"{uuid.uuid4().hex}{ext}"
    path = _sample_path(customer.id, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    template.sample_key, template.sample_mime, template.sample_size = key, mime, len(content)
    template.sample_filename = template.sample_filename or f"{template.name}{ext}"
    db.commit()
    return path


def template_sample(db: Session, customer: Customer, template_id: int) -> FileResponse:
    template = _get(db, customer, template_id)
    path = _ensure_sample(db, customer, template)
    if path is None:
        raise HTTPException(404, detail="This template has no sample file")
    return FileResponse(path, media_type=template.sample_mime or "application/octet-stream",
                        filename=template.sample_filename or path.name, content_disposition_type="inline",
                        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


def _remove_sample(db: Session, template: WaTemplate) -> None:
    key = template.sample_key
    if not key:
        return
    shared = db.query(WaTemplate.id).filter(WaTemplate.customer_id == template.customer_id,
                                            WaTemplate.sample_key == key, WaTemplate.id != template.id).first()
    if not shared:
        _sample_path(template.customer_id, key).unlink(missing_ok=True)


def _resolve_sample(db: Session, customer: Customer, payload: TemplateSchema,
                    template: WaTemplate | None) -> tuple[str, str, str, int] | None:
    """(key, mime, filename, size) of the header sample the form points at, or None."""
    if payload.header.format not in builder.MEDIA_FORMATS:
        return None
    key = payload.sample_key
    if not key and template and template.sample_key:
        key = template.sample_key
    if not key:
        if template:  # a WhatsApp Manager template: its Meta-hosted sample becomes the local one
            path = _ensure_sample(db, customer, template)
            if path:
                return template.sample_key, template.sample_mime, template.sample_filename, template.sample_size
        return None
    copy = COPY_KEY.match(key)
    if copy:  # duplicating another template: give the copy its own file
        source = _get(db, customer, int(copy.group(1)))
        path = _ensure_sample(db, customer, source)
        if path is None:
            return None
        new_key = f"{uuid.uuid4().hex}{path.suffix}"
        shutil.copyfile(path, _sample_path(customer.id, new_key))
        return new_key, source.sample_mime, source.sample_filename, source.sample_size
    if not SAMPLE_KEY.match(key) or not _sample_path(customer.id, key).exists():
        raise field_error(422, "sample", "Upload the sample file again")
    mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
    if mime not in SAMPLE_TYPES[payload.header.format]:
        raise field_error(422, "sample", f"This file doesn't match a {payload.header.format} header")
    if template and key == template.sample_key:
        return key, template.sample_mime or mime, template.sample_filename, template.sample_size
    size = _sample_path(customer.id, key).stat().st_size
    return key, mime, payload.sample_filename or key, size


# Create, edit, submit, delete ----------------------------------------------------------

def _meta_error(exc: WhatsAppError) -> HTTPException:
    text = exc.details or str(exc)
    if "already exists" in text.lower() or "name" in text.lower() and "exist" in text.lower():
        return field_error(422, "name", text)
    return HTTPException(422, detail=f"Meta didn't accept the template: {text}")


def _raise_errors(errors: dict[str, str]) -> None:
    if errors:
        first = next(iter(errors.values()))
        raise HTTPException(422, detail={"message": first, "errors": {k: [v] for k, v in errors.items()}})


def save_template(db: Session, customer: Customer, payload: TemplateSchema, template_id: int | None = None) -> dict:
    template = _get(db, customer, template_id) if template_id else None
    on_meta = bool(template and template.meta_id)
    if template and template.status in IN_REVIEW:
        raise HTTPException(422, detail="Meta is reviewing this template. You can edit it after the decision.")
    if template and template.status not in EDITABLE | {"draft"}:
        raise HTTPException(422, detail=f"A {template.status} template can't be edited")
    if on_meta:
        if not payload.submit:
            raise HTTPException(422, detail="This template is already on Meta. Submit your changes for review.")
        if payload.name != template.name or payload.language != template.language:
            raise field_error(422, "name", "The name and language can't change after a template is submitted")
        if payload.category != template.category and template.status != "rejected":
            raise field_error(422, "category", "The category can only change while a template is rejected")
    if not payload.name:
        raise field_error(422, "name", "Give the template a name")

    clash = db.query(WaTemplate.id).filter(WaTemplate.customer_id == customer.id, WaTemplate.name == payload.name,
                                           WaTemplate.language == payload.language)
    if template:
        clash = clash.filter(WaTemplate.id != template.id)
    if clash.first():
        raise field_error(409, "name", "You already have a template with this name in this language")

    sample = _resolve_sample(db, customer, payload, template)
    if payload.submit:
        _raise_errors(builder.validate(payload, has_sample=sample is not None))

    stamp = now()
    status = "draft"
    meta_id = template.meta_id if template else None
    category = payload.category
    if payload.submit:
        account, client = client_for(db, customer)
        try:
            handle = None
            if sample:
                content = _sample_path(customer.id, sample[0]).read_bytes()
                handle = client.upload_sample(content, sample[1], sample[2] or sample[0])
            components = builder.build_components(payload, handle)
            if on_meta:
                body: dict = {"components": components}
                if payload.category != template.category:
                    body["category"] = payload.category.upper()
                client.edit_template(template.meta_id, body)
                status = "pending"
            else:
                body = {"name": payload.name, "language": payload.language, "category": payload.category.upper(),
                        "components": components}
                if payload.parameter_format == "named":
                    body["parameter_format"] = "NAMED"
                result = client.create_template(account.waba_id, body)
                meta_id = str(result.get("id") or "") or None
                status = _status_of(result.get("status"))
                category = (result.get("category") or payload.category).lower()
        except WhatsAppError as exc:
            if sample and template is None and payload.sample_key != sample[0]:
                _sample_path(customer.id, sample[0]).unlink(missing_ok=True)  # the copy made for this save
            raise _meta_error(exc) from exc
    else:
        components = builder.build_components(payload)

    if template is None:
        template = WaTemplate(customer_id=customer.id, source="app")
        db.add(template)
    elif sample is None or sample[0] != template.sample_key:
        _remove_sample(db, template)
    if sample is None or sample[0] != template.sample_key:
        template.media_id = None
    template.name, template.language, template.category = payload.name, payload.language, category
    template.parameter_format = payload.parameter_format
    template.components = components
    template.sample_key, template.sample_mime, template.sample_filename, template.sample_size = \
        sample if sample else (None, None, None, None)
    if template.status != status:
        template.status_changed_at = stamp
    template.status = status
    template.meta_id = meta_id
    if payload.submit:
        template.submitted_at = stamp
        template.rejected_reason = None
    db.commit()
    message = ("Submitted to Meta for review" if status in IN_REVIEW else
               "Approved by Meta" if status == "approved" else
               f"Meta marked it {status}" if payload.submit else "Draft saved")
    return {"status": True, "message": message, "data": serialize(template)}


def delete_template(db: Session, customer: Customer, template_id: int) -> dict:
    template = _get(db, customer, template_id)
    if template.meta_id:
        account, client = client_for(db, customer)
        try:
            client.delete_template(account.waba_id, template.name, template.meta_id)
        except WhatsAppError as exc:
            text = (exc.details or str(exc)).lower()
            if exc.status != 404 and "not found" not in text and "does not exist" not in text:
                raise HTTPException(422, detail=f"Meta couldn't delete the template: {exc.details or exc}") from exc
    _remove_sample(db, template)
    db.delete(template)
    db.commit()
    return {"status": True, "message": "Template deleted", "data": None}


# Webhook updates (called by the inbox processor) --------------------------------------

def _find(db: Session, customer_id: int, value: dict) -> WaTemplate | None:
    meta_id = str(value.get("message_template_id") or "")
    q = db.query(WaTemplate).filter(WaTemplate.customer_id == customer_id)
    found = q.filter(WaTemplate.meta_id == meta_id).first() if meta_id else None
    if found is None and value.get("message_template_name"):
        found = q.filter(WaTemplate.name == value["message_template_name"],
                         WaTemplate.language == value.get("message_template_language")).first()
    return found


def apply_webhook(db: Session, customer_id: int, field: str, value: dict) -> bool:
    template = _find(db, customer_id, value)
    if template is None:
        return False
    if field == "message_template_status_update":
        event = (value.get("event") or "").upper()
        status = {"REINSTATED": "approved", "FLAGGED": template.status}.get(event, event.lower())
        if not status:
            return False
        if status != template.status:
            template.status_changed_at = now()
        template.status = status
        reason = value.get("reason") or (value.get("other_info") or {}).get("description")
        template.rejected_reason = None if not reason or reason == "NONE" else str(reason)[:255]
    elif field == "message_template_quality_update":
        template.quality = value.get("new_quality_score") or template.quality
    elif field == "template_category_update":
        new = value.get("new_category") or value.get("correct_category")
        if new:
            template.category = new.lower()
    return True


# Sending (used by the inbox and campaigns) -------------------------------------------

def approved(db: Session, customer: Customer) -> list[WaTemplate]:
    return (db.query(WaTemplate).filter(WaTemplate.customer_id == customer.id, WaTemplate.status == "approved")
            .order_by(WaTemplate.updated_at.desc()).all())


def find_approved(db: Session, customer: Customer, name: str, language: str) -> WaTemplate | None:
    return db.query(WaTemplate).filter(WaTemplate.customer_id == customer.id, WaTemplate.name == name,
                                       WaTemplate.language == language, WaTemplate.status == "approved").first()


def header_media_id(db: Session, customer: Customer, client: WhatsAppClient, template: WaTemplate,
                    override_key: str | None = None) -> tuple[str, str, str, Path]:
    """(WhatsApp media id, mime, filename, local path) for a media header.

    Uses `override_key` (a file uploaded for this send) or the template's own sample, uploaded once
    and reused while Meta still has it.
    """
    if override_key:
        path = _sample_path(customer.id, override_key)
        if not SAMPLE_KEY.match(override_key) or not path.exists():
            raise field_error(422, "header_media", "Upload the header file again")
        mime = mimetypes.guess_type(override_key)[0] or "application/octet-stream"
        return client.upload_media(path.read_bytes(), mime, path.name), mime, path.name, path
    path = _ensure_sample(db, customer, template)
    if path is None:
        raise field_error(422, "header_media", "Choose a file for the header")
    fresh = template.media_uploaded_at and template.media_uploaded_at > now() - timedelta(days=MEDIA_ID_DAYS)
    if not (template.media_id and fresh):
        template.media_id = client.upload_media(path.read_bytes(), template.sample_mime or "application/octet-stream",
                                                template.sample_filename or path.name)
        template.media_uploaded_at = now()
    return template.media_id, template.sample_mime, template.sample_filename or path.name, path
