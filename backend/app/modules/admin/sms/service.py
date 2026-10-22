from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.sms.models import SmsLog
from app.modules.admin.sms.schemas import SmsSettingsSchema, SmsTemplatesSchema, SmsTestSchema
from app.services.sms import GATEWAYS, SMS_TEMPLATES, SmsError, normalize_phone, send_template
from app.services.sms import config as sms_config
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso
from app.shared.utils.search import search_clause

SUBJECT = "settings"


def _payload(db: Session) -> dict:
    return {
        "status": True,
        "data": {
            "settings": sms_config.load(db),
            "gateways": [gw.spec() for gw in GATEWAYS.values()],
            "templates": [t.spec() for t in SMS_TEMPLATES.values()],
        },
    }


def show(db: Session) -> dict:
    return _payload(db)


def _flat(cfg: dict) -> dict:
    flat = {"default_country_code": cfg["default_country_code"], "order": cfg["order"]}
    for key, values in cfg["gateways"].items():
        for name, value in values.items():
            if name.startswith("has_"):
                flat[f"{key}.{name[4:]}"] = "••••••" if value else None
            else:
                flat[f"{key}.{name}"] = value
    for key, values in cfg["templates"].items():
        flat[f"template.{key}"] = values["body"]
        for gw, tid in values["template_ids"].items():
            flat[f"template.{key}.{gw}"] = tid
    return flat


def update(db: Session, payload: SmsSettingsSchema, request: Request) -> dict:
    data = payload.model_dump()
    errors: dict[str, list[str]] = {}
    for key in data["gateways"]:
        if key not in GATEWAYS:
            errors[f"gateways.{key}"] = ["Unknown SMS gateway"]
    for key in data["templates"]:
        if key not in SMS_TEMPLATES:
            errors[f"templates.{key}"] = ["Unknown SMS template"]
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"errors": errors})

    before = _flat(sms_config.load(db))
    saved = sms_config.save(db, data)
    for key, gw in GATEWAYS.items():
        values = saved["gateways"][key]
        if values.get("enabled"):
            for field in gw.fields:
                if field.required and not str(values.get(field.name) or "").strip():
                    errors[f"gateways.{key}.{field.name}"] = [f"{field.label} is required to turn on {gw.label}"]
            if not errors:
                for label in gw.missing(values):
                    errors[f"gateways.{key}"] = [f"{gw.label}: {label} is required"]
    if errors:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"errors": errors})

    old, new = diff(before, _flat(sms_config.load(db)))
    if old or new:
        log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_label="sms",
                     description=f"Updated SMS gateway settings: {', '.join(sorted(new)) or 'no fields'}",
                     old_values=old, new_values=new)
    db.commit()
    return {**_payload(db), "message": "SMS settings saved"}


def update_templates(db: Session, payload: SmsTemplatesSchema, request: Request) -> dict:
    unknown = [k for k in payload.templates if k not in SMS_TEMPLATES]
    if unknown:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail={"errors": {f"templates.{k}": ["Unknown SMS template"] for k in unknown}})
    for key, values in payload.templates.items():
        if not values.body.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                                detail={"errors": {f"templates.{key}.body": ["Enter the message text"]}})
    before = _flat(sms_config.load(db))
    sms_config.save_templates(db, payload.model_dump()["templates"])
    old, new = diff(before, _flat(sms_config.load(db)))
    if old or new:
        log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_label="sms",
                     description=f"Updated SMS templates: {', '.join(sorted(new)) or 'no fields'}",
                     old_values=old, new_values=new)
    db.commit()
    return {**_payload(db), "message": "Templates saved"}


def test(db: Session, payload: SmsTestSchema, request: Request) -> dict:
    cfg = sms_config.load(db)
    phone = normalize_phone(payload.phone, cfg["default_country_code"])
    if not phone:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail={"errors": {"phone": ["Enter a valid mobile number"]}})
    if payload.gateway and payload.gateway not in GATEWAYS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail={"errors": {"gateway": ["Unknown SMS gateway"]}})
    try:
        result = send_template(db, "login_otp", phone, {"code": "123456", "minutes": 5},
                               gateways=[payload.gateway] if payload.gateway else None)
    except SmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    label = GATEWAYS[payload.gateway].label if payload.gateway else "the gateway chain"
    log_activity(db, "tested", request=request, subject_type=SUBJECT, subject_label="sms",
                 description=f"Sent a test SMS to {phone} via {label}: {'sent' if result.sent else 'failed'}")
    db.commit()
    data = {"sent": result.sent, "gateway": result.gateway, "attempts": result.attempts, "error": result.error}
    if not result.sent:
        raise HTTPException(status_code=400, detail={"message": result.error or "The SMS was not sent", "data": data})
    return {"status": True, "message": f"Test SMS sent to {phone} via {GATEWAYS[result.gateway].label}",
            "data": data}


def _serialize_log(row: SmsLog) -> dict:
    return {
        "id": row.id, "phone": row.phone, "template_key": row.template_key,
        "template": SMS_TEMPLATES[row.template_key].label if row.template_key in SMS_TEMPLATES else None,
        "message": row.message, "gateway": row.gateway,
        "gateway_label": GATEWAYS[row.gateway].label if row.gateway in GATEWAYS else None,
        "status": row.status, "message_id": row.message_id, "attempts": row.attempts or [], "error": row.error,
        "created_at": iso(row.created_at),
    }


def logs(db: Session, page=None, per_page=None, search=None, status_filter=None) -> dict:
    q = db.query(SmsLog)
    clause = search_clause([SmsLog.phone, SmsLog.message, SmsLog.error], search)
    if clause is not None:
        q = q.filter(clause)
    if status_filter:
        q = q.filter(SmsLog.status == status_filter)
    return list_response(q.order_by(SmsLog.id.desc()), _serialize_log, page or 1, per_page or 20, search)
