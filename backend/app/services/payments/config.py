import copy

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret, encrypt_secret
from app.services.payments.gateways import PAYMENT_GATEWAYS

SETTING_KEY = "payments"


def defaults() -> dict:
    return {
        "currency": "INR",
        "default_gateway": next(iter(PAYMENT_GATEWAYS)),
        "gateways": {
            key: {"enabled": False, **{f.name: (None if f.secret else f.default) for f in gw.fields}}
            for key, gw in PAYMENT_GATEWAYS.items()
        },
    }


def _row(db: Session):
    from app.modules.admin.settings.models import Setting

    return db.query(Setting).filter(Setting.key == SETTING_KEY).first()


def _merge(stored: dict) -> dict:
    cfg = defaults()
    cfg["currency"] = (stored.get("currency") or cfg["currency"]).upper()
    if stored.get("default_gateway") in PAYMENT_GATEWAYS:
        cfg["default_gateway"] = stored["default_gateway"]
    for key, values in (stored.get("gateways") or {}).items():
        if key in cfg["gateways"] and isinstance(values, dict):
            cfg["gateways"][key].update({k: v for k, v in values.items() if k in cfg["gateways"][key]})
    return cfg


def load(db: Session, *, with_secrets: bool = False) -> dict:
    row = _row(db)
    cfg = _merge(copy.deepcopy(row.value) if row and isinstance(row.value, dict) else {})
    for key, gw in PAYMENT_GATEWAYS.items():
        values = cfg["gateways"][key]
        values["test_mode"] = gw.is_test_mode(values)
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
    return [key for key in PAYMENT_GATEWAYS if cfg["gateways"].get(key, {}).get("enabled")]


def save(db: Session, data: dict) -> dict:
    from app.modules.admin.settings.models import Setting

    row = _row(db)
    current = _merge(row.value if row and isinstance(row.value, dict) else {})
    merged = _merge(data)
    for key, gw in PAYMENT_GATEWAYS.items():
        incoming = (data.get("gateways") or {}).get(key) or {}
        merged["gateways"][key].pop("test_mode", None)
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
