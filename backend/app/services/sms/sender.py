import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.config import DEFAULT_APP_NAME, settings
from app.services.sms import config
from app.services.sms.base import SmsError, SmsMessage
from app.services.sms.gateways import GATEWAYS
from app.services.sms.phone import mask_phone, normalize_phone
from app.services.sms.templates import SMS_TEMPLATES, render

logger = logging.getLogger(__name__)

SMS_DISABLED_MESSAGE = "No SMS gateway is turned on. Enable one in Settings → SMS gateways."


@dataclass
class SmsResult:
    sent: bool
    gateway: str | None = None
    message_id: str | None = None
    attempts: list[dict] = field(default_factory=list)
    error: str | None = None


def _app_name(db: Session) -> str:
    from app.modules.admin.settings.service import get_group

    return get_group(db, "general").get("app_name") or DEFAULT_APP_NAME


def _record(phone: str, template_key: str | None, text: str, result: SmsResult) -> None:
    from app.core.database import SessionLocal
    from app.modules.admin.sms.models import SmsLog

    try:
        with SessionLocal() as db:
            db.add(SmsLog(phone=phone, template_key=template_key, message=text[:1000], gateway=result.gateway,
                          status="sent" if result.sent else ("skipped" if not result.attempts else "failed"),
                          message_id=(result.message_id or None) and str(result.message_id)[:120],
                          attempts=result.attempts, error=(result.error or "")[:1000] or None))
            db.commit()
    except Exception:
        logger.exception("Couldn't record SMS log")


def _deliver(cfg: dict, message: SmsMessage, template_ids: dict, gateways: list[str]) -> SmsResult:
    result = SmsResult(sent=False)
    for key in gateways:
        gateway = GATEWAYS[key]
        values = cfg["gateways"][key]
        message.template_id = template_ids.get(key) or None
        try:
            missing = gateway.missing(values)
            if missing:
                raise SmsError(f"Missing {', '.join(missing)}")
            message_id = gateway.send(values, message)
        except SmsError as exc:
            logger.warning("SMS via %s to %s failed: %s", gateway.label, mask_phone(message.phone), exc)
            result.attempts.append({"gateway": key, "ok": False, "error": str(exc)})
            continue
        except Exception as exc:
            logger.exception("SMS gateway %s crashed", gateway.label)
            result.attempts.append({"gateway": key, "ok": False, "error": str(exc) or exc.__class__.__name__})
            continue
        result.attempts.append({"gateway": key, "ok": True})
        result.sent, result.gateway, result.message_id = True, key, message_id
        return result
    result.error = "; ".join(f"{GATEWAYS[a['gateway']].label}: {a['error']}" for a in result.attempts)
    return result


def send_sms(db: Session, to: str, text: str, *, template_key: str | None = None,
             variables: dict | None = None, template_ids: dict | None = None, gateways: list[str] | None = None,
             log_text: str | None = None, raise_errors: bool = False) -> SmsResult:
    cfg = config.load(db, with_secrets=True)
    phone = normalize_phone(to, cfg["default_country_code"])
    if not phone:
        raise SmsError("Enter a valid mobile number")
    chain = gateways or config.enabled_gateways(cfg)
    if not chain:
        result = SmsResult(sent=False, error=SMS_DISABLED_MESSAGE)
        if settings.is_production:
            logger.warning("SMS disabled — not sending %s to %s", template_key or "message", mask_phone(phone))
        else:
            logger.warning("SMS disabled — would send to %s: %s", phone, text)
        _record(phone, template_key, log_text or text, result)
        if raise_errors:
            raise SmsError(SMS_DISABLED_MESSAGE)
        return result
    message = SmsMessage(phone=phone, text=text, country_code=cfg["default_country_code"],
                         template_key=template_key,
                         variables={k: str(v) for k, v in (variables or {}).items()})
    result = _deliver(cfg, message, template_ids or {}, chain)
    _record(phone, template_key, log_text or text, result)
    if not result.sent and raise_errors:
        raise SmsError(f"Every SMS gateway failed. {result.error}")
    return result


def send_template(db: Session, key: str, to: str, variables: dict | None = None, *,
                  gateways: list[str] | None = None, raise_errors: bool = False) -> SmsResult:
    template = SMS_TEMPLATES[key]
    cfg = config.load(db)
    stored = cfg["templates"].get(key) or {}
    values = {"app": _app_name(db), **{k: str(v) for k, v in (variables or {}).items()}}
    ordered = {name: values.get(name, "") for name in template.variables}
    body = stored.get("body") or template.body
    masked = {k: ("•" * len(v) if k in template.sensitive else v) for k, v in ordered.items()}
    return send_sms(db, to, render(body, ordered), template_key=key, variables=ordered,
                    template_ids=stored.get("template_ids") or {}, gateways=gateways,
                    log_text=render(body, masked), raise_errors=raise_errors)


def sms_available(db: Session) -> bool:
    return bool(config.enabled_gateways(config.load(db)))
