import copy

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.services.sms.gateways import GATEWAYS
from app.services.sms.templates import SMS_TEMPLATES

SETTING_KEY = "sms"


def defaults() -> dict:
    return {
        "default_country_code": "91",
        "order": list(GATEWAYS),
        "gateways": {
            key: {"enabled": False, **{f.name: (None if f.secret else f.default) for f in gw.fields}}
            for key, gw in GATEWAYS.items()
        },
        "templates": {key: {"body": t.body, "template_ids": {}} for key, t in SMS_TEMPLATES.items()},
    }


def _stored(db: Session) -> dict:
    from app.modules.admin.settings.models import Setting

    row = db.query(Setting).filter(Setting.key == SETTING_KEY).first()
    return copy.deepcopy(row.value) if row and isinstance(row.value, dict) else {}


def _merge(stored: dict) -> dict:
    cfg = defaults()
    cfg["default_country_code"] = stored.get("default_country_code") or cfg["default_country_code"]
    order = [k for k in stored.get("order") or [] if k in GATEWAYS]
    cfg["order"] = list(dict.fromkeys(order + [k for k in GATEWAYS if k not in order]))
    for key, values in (stored.get("gateways") or {}).items():
        if key in cfg["gateways"] and isinstance(values, dict):
            cfg["gateways"][key].update({k: v for k, v in values.items() if k in cfg["gateways"][key]})
    for key, values in (stored.get("templates") or {}).items():
        if key in cfg["templates"] and isinstance(values, dict):
            cfg["templates"][key]["body"] = values.get("body") or cfg["templates"][key]["body"]
            cfg["templates"][key]["template_ids"] = {
                gw: str(tid) for gw, tid in (values.get("template_ids") or {}).items() if gw in GATEWAYS and tid
            }
    return cfg


def load(db: Session, *, with_secrets: bool = False) -> dict:
    cfg = _merge(_stored(db))
    for key, gw in GATEWAYS.items():
        values = cfg["gateways"][key]
        for f in gw.fields:
            if not f.secret:
                continue
            if with_secrets:
                values[f.name] = decrypt_secret(values.get(f.name))
            else:
                values[f"has_{f.name}"] = bool(values.get(f.name))
                values.pop(f.name, None)
    return cfg


def enabled_gateways(cfg: dict) -> list[str]:
    return [key for key in cfg["order"] if cfg["gateways"].get(key, {}).get("enabled")]


def save(db: Session, data: dict) -> dict:
    from app.modules.admin.settings.models import Setting

    row = db.query(Setting).filter(Setting.key == SETTING_KEY).first()
    current = _merge(row.value if row and isinstance(row.value, dict) else {})
    merged = _merge(data)
    if not data.get("templates"):
        merged["templates"] = current["templates"]
    for key, gw in GATEWAYS.items():
        incoming = (data.get("gateways") or {}).get(key) or {}
        for f in gw.fields:
            if not f.secret:
                continue
            if incoming.get(f.name):
                merged["gateways"][key][f.name] = encrypt_secret(incoming[f.name])
            elif incoming.get(f"clear_{f.name}"):
                merged["gateways"][key][f.name] = None
            else:
                merged["gateways"][key][f.name] = current["gateways"][key].get(f.name)
    if row is None:
        db.add(Setting(key=SETTING_KEY, value=merged))
    else:
        row.value = merged
    db.flush()
    return merged


def save_templates(db: Session, templates: dict) -> dict:
    from app.modules.admin.settings.models import Setting

    row = db.query(Setting).filter(Setting.key == SETTING_KEY).first()
    stored = copy.deepcopy(row.value) if row and isinstance(row.value, dict) else {}
    current = _merge(stored)["templates"]
    for key, values in templates.items():
        if key in current:
            current[key] = {"body": values.get("body") or current[key]["body"],
                            "template_ids": {gw: tid for gw, tid in (values.get("template_ids") or {}).items()
                                             if gw in GATEWAYS and tid}}
    stored["templates"] = current
    if row is None:
        db.add(Setting(key=SETTING_KEY, value=_merge(stored)))
    else:
        row.value = stored
    db.flush()
    return current
