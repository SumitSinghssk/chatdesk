import html
import re
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import DEFAULT_APP_NAME, settings
from app.modules.admin.activity_log.service import diff, log_activity
from app.modules.admin.email_templates.definitions import (
    DEFINITIONS,
    DESIGN_DEFAULTS,
    FIELD_HINTS,
    GROUPS,
    REPLY_HINTS,
)
from app.modules.admin.settings.models import Setting
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import client_ip, describe_agent, user_agent

KEY = "email_templates"
DESIGN_KEY = "email_design"
SUBJECT = "email_template"

_PLACEHOLDER = re.compile(r"\{\s*([a-zA-Z_]+)\s*\}")
_URL = re.compile(r"""(?<![="\w/])(https?://[^\s<"]+[^\s<".,;:!?)\]])""", re.IGNORECASE)


def _row(db: Session, key: str) -> Setting | None:
    return db.query(Setting).filter(Setting.key == key).first()


def _read(db: Session, key: str) -> dict:
    row = _row(db, key)
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def _write(db: Session, key: str, value: dict) -> None:
    row = _row(db, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


def definition(key: str) -> dict:
    found = DEFINITIONS.get(key)
    if found is None:
        raise HTTPException(status_code=404, detail="Email template not found")
    return found


def custom(db: Session, key: str, stored: dict | None = None) -> dict | None:
    row = (stored if stored is not None else _read(db, KEY)).get(key)
    return row if isinstance(row, dict) else None


def defaults(key: str) -> dict:
    d = definition(key)
    return {f: str(d["defaults"].get(f, "")) for f in d["fields"]}


def values(db: Session, key: str, stored: dict | None = None) -> dict:
    d = definition(key)
    saved = custom(db, key, stored) or {}
    return {f: str(saved[f]) if f in saved and saved[f] is not None else str(d["defaults"].get(f, ""))
            for f in d["fields"]}


def enabled(db: Session, key: str, stored: dict | None = None) -> bool:
    if not definition(key)["optional"]:
        return True
    return bool((custom(db, key, stored) or {}).get("enabled", True))


def is_customised(db: Session, key: str, stored: dict | None = None) -> bool:
    if not custom(db, key, stored):
        return False
    return values(db, key, stored) != defaults(key) or not enabled(db, key, stored)


def design(db: Session) -> dict:
    saved = _read(db, DESIGN_KEY)
    return {**DESIGN_DEFAULTS, **{k: v for k, v in saved.items() if k in DESIGN_DEFAULTS}}


def unknown_placeholders(key: str, text: str) -> list[str]:
    known = definition(key)["placeholders"]
    found: list[str] = []
    for match in _PLACEHOLDER.finditer(text or ""):
        name = match.group(1).lower()
        if name not in known and name not in found:
            found.append(name)
    return found


def _general(db: Session) -> dict:
    from app.modules.admin.settings.service import get_group

    return get_group(db, "general")


def _absolute(url: str | None, base: str) -> str | None:
    if not url:
        return None
    if re.match(r"^https?://", url):
        return url
    return f"{base.rstrip('/')}/{url.lstrip('/')}"


def site_url() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def format_when(value=None) -> str:
    value = value or now()
    return value.strftime("%d %b %Y, %I:%M %p").replace(" 0", " ")


def device_variables(request: Request | None) -> dict:
    agent = describe_agent(user_agent(request))
    browser = (agent.get("browser") or "").split(" ")[0] or None
    platform = agent.get("platform")
    device = f"{browser} on {platform}" if browser and platform else (browser or platform or "Unknown device")
    return {"when": format_when(), "device": device, "ip": client_ip(request) or "Unknown"}


def common_variables(db: Session, variables: dict) -> dict:
    name = str(variables.get("name") or "").strip()
    return {
        "app_name": _general(db).get("app_name") or DEFAULT_APP_NAME,
        "site_url": site_url(),
        "first_name": name.split(" ")[0] if name else "there",
        **{k: v for k, v in variables.items() if v is not None},
    }


def sample_variables(db: Session, key: str, viewer=None) -> dict:
    out = {"app_name": _general(db).get("app_name") or DEFAULT_APP_NAME, "site_url": site_url()}
    for name, (_, sample) in definition(key)["placeholders"].items():
        if sample is not None:
            out[name] = sample
    return {
        **out,
        "when": format_when(),
        "unlock_info": f"It unlocks by itself at {format_when(now() + timedelta(minutes=15))}.",
        "sender_name": getattr(viewer, "name", None) or "Rahul Verma",
    }


def fill(text: str, variables: dict) -> str:
    def repl(m: re.Match) -> str:
        name = m.group(1).lower()
        return str(variables[name]) if name in variables else m.group(0)

    return _PLACEHOLDER.sub(repl, text or "")


def _squish(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _plain(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.S).strip()


def _paragraph(paragraph: str, variables: dict, accent: str) -> str:
    tokens: dict[str, str] = {}

    def mark(m: re.Match) -> str:
        name = m.group(1).lower()
        if name not in variables:
            return m.group(0)
        token = f"\x01{len(tokens)}\x02"
        tokens[token] = html.escape(str(variables[name]))
        return token

    out = html.escape(_PLACEHOLDER.sub(mark, paragraph), quote=True)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out, flags=re.S)
    for token, value in tokens.items():
        out = out.replace(token, value)
    out = _URL.sub(lambda m: f'<a href="{m.group(1)}" style="color: {html.escape(accent)}; '
                             f'word-break: break-all">{m.group(1)}</a>', out)
    out = out.replace("\n", "<br>")
    return f'<p style="margin: 0 0 14px">{out}</p>'


def to_html(text: str, variables: dict, accent: str) -> str:
    paragraphs = [p.strip() for p in re.split(r"(?:\r?\n){2,}", (text or "").strip())]
    return "".join(_paragraph(p, variables, accent) for p in paragraphs if p)


def _layout(title: str, content: str, *, app_name: str, design_: dict, logo: str | None,
            footer: str | None = None) -> str:
    e = html.escape
    accent = e(design_["accent"])
    logo_html = (
        f'<div style="max-width: 520px; margin: 0 auto 16px; text-align: center">'
        f'<img src="{e(logo)}" alt="{e(app_name)}" style="max-height: 40px; max-width: 200px; border: 0" /></div>'
        if logo else ""
    )
    footer_text = footer if footer else design_.get("footer") or ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{e(title)}</title></head>
<body style="margin: 0; padding: 32px 16px; background: #f1f5f9; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #334155">
{logo_html}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; border-top: 3px solid {accent};">
<tr><td style="padding: 32px">{content}</td></tr>
</table>
<p style="max-width: 520px; margin: 16px auto 0; font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center">{e(app_name)}{' · ' + e(footer_text) if footer_text else ''}</p>
</body>
</html>"""


def _context(db: Session) -> tuple[dict, str, str | None]:
    general = _general(db)
    d = design(db)
    app_name = general.get("app_name") or DEFAULT_APP_NAME
    logo = _absolute(general.get("logo_light"), settings.APP_URL) if d.get("show_logo") else None
    return d, app_name, logo


def render(db: Session, key: str, variables: dict, *, details: dict | None = None, url: str | None = None,
           overrides: dict | None = None) -> dict:
    d = definition(key)
    vals = {**values(db, key), **{k: v for k, v in (overrides or {}).items() if k in d["fields"] and v is not None}}
    variables = common_variables(db, variables)
    design_, app_name, logo = _context(db)
    accent = design_["accent"]
    e = html.escape

    subject = _squish(fill(vals.get("subject", ""), variables))
    heading = _squish(fill(vals.get("heading", ""), variables))
    button = _squish(fill(vals.get("button", ""), variables))
    body_html = to_html(vals.get("body", ""), variables, accent)
    note_html = to_html(vals.get("note", ""), variables, accent)
    body_text = _plain(fill(vals.get("body", ""), variables))
    note_text = _plain(fill(vals.get("note", ""), variables))
    details = {k: v for k, v in (details or {}).items() if v not in (None, "")}

    parts = []
    if heading:
        parts.append(f'<h1 style="margin: 0 0 12px; font-size: 20px; line-height: 1.3; color: #0f172a">{e(heading)}</h1>')
    parts.append(f'<div style="font-size: 14px; line-height: 1.6">{body_html}</div>')
    if button and url:
        parts.append(
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 6px 0 20px"><tr>'
            f'<td style="border-radius: 8px; background: {e(accent)}"><a href="{e(url)}" style="display: inline-block; '
            'padding: 12px 22px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none">'
            f'{e(button)}</a></td></tr></table>'
            '<p style="margin: 0 0 20px; font-size: 12px; line-height: 1.6; color: #64748b">'
            "If the button doesn't work, copy this address into your browser:<br />"
            f'<a href="{e(url)}" style="color: {e(accent)}; word-break: break-all">{e(url)}</a></p>'
        )
    if details:
        rows = []
        for i, (label, value) in enumerate(details.items()):
            border = "" if i == 0 else "; border-top: 1px solid #e2e8f0"
            rows.append(f'<tr><td style="padding: 10px 14px; color: #64748b{border}">{e(str(label))}</td>'
                        f'<td style="padding: 10px 14px; color: #0f172a; text-align: right{border}">{e(str(value))}</td></tr>')
        parts.append('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
                     'style="margin: 6px 0 0; font-size: 13px; background: #f8fafc; border-radius: 8px">'
                     + "".join(rows) + "</table>")
    if note_text:
        color = "#b91c1c" if d["warn"] else "#64748b"
        parts.append(f'<div style="margin: 20px 0 0; font-size: 13px; line-height: 1.6; color: {color}">{note_html}</div>')

    text_parts = [p for p in (heading, body_text) if p]
    if button and url:
        text_parts.append(f"{button}: {url}")
    if details:
        text_parts.append("\n".join(f"{k}: {v}" for k, v in details.items()))
    if note_text:
        text_parts.append(note_text)
    text_parts.append(f"-- \n{app_name}" + (f" · {design_['footer']}" if design_.get("footer") else ""))

    return {
        "subject": subject,
        "html": _layout(heading or subject, "".join(parts), app_name=app_name, design_=design_, logo=logo),
        "text": "\n\n".join(text_parts),
    }


def render_reply(db: Session, variables: dict, subject: str, body: str, original: str | None = None,
                 received_at: str | None = None, overrides: dict | None = None) -> dict:
    vals = {**values(db, "enquiry_reply"), **{k: v for k, v in (overrides or {}).items() if v is not None}}
    variables = common_variables(db, variables)
    design_, app_name, logo = _context(db)
    footer = _plain(fill(vals.get("note", ""), variables))
    e = html.escape

    def nl2br(text: str) -> str:
        return e(text).replace("\r\n", "\n").replace("\n", "<br>")

    content = f'<div style="font-size: 15px; line-height: 1.7; color: #1e293b">{nl2br(body)}</div>'
    if original:
        on = f" on {e(received_at)}" if received_at else ""
        content += (
            '<div style="margin-top: 28px; padding: 14px 16px; border-left: 3px solid #cbd5e1; background: #f8fafc; '
            'border-radius: 0 8px 8px 0">'
            f'<p style="margin: 0 0 6px; font-size: 12px; color: #64748b">Your message{on}:</p>'
            f'<div style="font-size: 13px; line-height: 1.6; color: #475569">{nl2br(original)}</div></div>'
        )
    text = body
    if original:
        text += f"\n\n--- Your message{' on ' + received_at if received_at else ''} ---\n{original}"
    text += f"\n\n-- \n{app_name}" + (f" · {footer or design_.get('footer') or ''}")
    return {
        "subject": subject,
        "html": _layout(app_name, content, app_name=app_name, design_=design_, logo=logo, footer=footer or None),
        "text": text,
    }


def reply_variables(db: Session, enquiry, sender) -> dict:
    app_name = _general(db).get("app_name") or DEFAULT_APP_NAME
    return {
        "name": enquiry.name or "",
        "email": enquiry.email or "",
        "enquiry_subject": enquiry.subject or f"Your enquiry to {app_name}",
        "reference": enquiry.reference,
        "sender_name": getattr(sender, "name", None) or app_name,
    }


def _sample_details(key: str, v: dict) -> dict:
    if key == "password_reset":
        return {"Requested from": v["device"], "IP address": v["ip"]}
    if key == "account_locked":
        return {"When": v["when"], "Last attempt from": v["device"], "IP address": v["ip"]}
    if key == "password_changed":
        return {"When": v["when"], "Device": v["device"], "IP address": v["ip"]}
    if key.startswith("two_factor"):
        return {"Account": v["email"], "When": v["when"],
                "Done by": v["done_by"] if key == "two_factor_reset" else None,
                "Device": v["device"], "IP address": v["ip"]}
    return {}


def details_for(key: str, variables: dict) -> dict:
    v = {"device": None, "ip": None, "when": None, "email": None, "done_by": None, **variables}
    return _sample_details(key, v)


def preview(db: Session, key: str, overrides: dict | None = None, viewer=None) -> dict:
    variables = sample_variables(db, key, viewer)
    if key == "enquiry_reply":
        vals = {**values(db, key), **{k: v for k, v in (overrides or {}).items() if v is not None}}
        filled = common_variables(db, variables)
        subject = _squish(fill(vals.get("subject", ""), filled))
        body = _plain(fill(vals.get("body", ""), filled)).replace(
            "\n\n\n\n", "\n\nThanks for getting in touch. Our plans start at ₹999 a month and every plan includes "
                        "a free 14-day trial.\n\n")
        return render_reply(db, variables, subject, body,
                            "Hello, could you tell me more about your pricing?\n\nThanks,\nPriya",
                            (now() - timedelta(days=1)).strftime("%d %b %Y"), overrides)
    url = f"{site_url()}/admin/forgot-password" if "button" in definition(key)["fields"] else None
    return render(db, key, variables, details=_sample_details(key, variables), url=url, overrides=overrides)


def _serialize(db: Session, key: str, stored: dict) -> dict:
    d = definition(key)
    saved = custom(db, key, stored) or {}
    return {
        "key": key,
        "group": d["group"],
        "label": d["label"],
        "description": d["description"],
        "optional": d["optional"],
        "warn": d["warn"],
        "enabled": enabled(db, key, stored),
        "fields": d["fields"],
        "hints": {**FIELD_HINTS, **REPLY_HINTS} if key == "enquiry_reply" else FIELD_HINTS,
        "placeholders": [{"name": n, "label": meta[0]} for n, meta in d["placeholders"].items()],
        "values": values(db, key, stored),
        "defaults": defaults(key),
        "customised": is_customised(db, key, stored),
        "updated_at": saved.get("updated_at"),
        "updated_by": saved.get("updated_by"),
    }


def list_templates(db: Session) -> dict:
    stored = _read(db, KEY)
    return {
        "status": True,
        "data": {
            "groups": [{"key": k, "label": v} for k, v in GROUPS.items()],
            "templates": [_serialize(db, key, stored) for key in DEFINITIONS],
            "design": design(db),
        },
    }


def _clean_fields(key: str, payload_values: dict, *, strict: bool) -> dict:
    d = definition(key)
    out = {}
    errors: dict[str, list[str]] = {}
    for field in d["fields"]:
        value = str(payload_values.get(field) or "").replace("\r\n", "\n").strip()
        if strict and not value and field in ("subject", "body", "button"):
            errors[field] = [{
                "subject": "The email needs a subject.",
                "body": "The email needs some text.",
                "button": "Give the button a label, e.g. “Choose a new password”.",
            }[field]]
        unknown = unknown_placeholders(key, value)
        if strict and unknown:
            names = ", ".join("{" + n + "}" for n in unknown)
            errors.setdefault(field, []).append(
                f"{names} can't be filled in for this email. Use one of the placeholders listed next to the editor.")
        out[field] = value
    if errors:
        raise HTTPException(status_code=422, detail={"message": next(iter(errors.values()))[0], "errors": errors})
    return out


def update_template(db: Session, key: str, payload, request: Request, user) -> dict:
    d = definition(key)
    clean = _clean_fields(key, payload.model_dump(exclude_none=True), strict=True)
    stored = _read(db, KEY)
    before = values(db, key, stored)
    stored[key] = {
        **clean,
        "enabled": bool(payload.enabled) if d["optional"] and payload.enabled is not None else True,
        "updated_at": iso(now()),
        "updated_by": getattr(user, "name", None),
    }
    _write(db, KEY, stored)
    old, new = diff(before, clean)
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_label=d["label"],
                 description=f"Updated the “{d['label']}” email", old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": f"“{d['label']}” email saved. It is used from the next email on.",
            "data": _serialize(db, key, _read(db, KEY))}


def restore_template(db: Session, key: str, request: Request) -> dict:
    d = definition(key)
    stored = _read(db, KEY)
    before = stored.pop(key, None)
    _write(db, KEY, stored)
    log_activity(db, "restored", request=request, subject_type=SUBJECT, subject_label=d["label"],
                 description=f"Restored the original “{d['label']}” email", old_values=before)
    db.commit()
    return {"status": True, "message": f"“{d['label']}” is back to the original text.",
            "data": _serialize(db, key, _read(db, KEY))}


def update_design(db: Session, payload, request: Request) -> dict:
    before = design(db)
    data = {"accent": payload.accent.lower(), "footer": (payload.footer or "").strip(),
            "show_logo": bool(payload.show_logo)}
    _write(db, DESIGN_KEY, data)
    log_activity(db, "updated", request=request, subject_type="settings", subject_label=DESIGN_KEY,
                 description="Updated the email look", old_values=before, new_values=data)
    db.commit()
    return {"status": True, "message": "Email look saved. Every email uses it from now on.", "data": design(db)}


def preview_template(db: Session, key: str, overrides: dict | None, viewer) -> dict:
    definition(key)
    clean = _clean_fields(key, overrides, strict=False) if overrides else None
    rendered = preview(db, key, clean, viewer)
    unknown = unknown_placeholders(key, " ".join((clean or values(db, key)).values()))
    return {"status": True, "data": {"subject": rendered["subject"], "html": rendered["html"], "unknown": unknown}}


def send_test(db: Session, key: str, overrides: dict | None, user, request: Request) -> dict:
    from app.core.mailer import deliver

    d = definition(key)
    clean = _clean_fields(key, overrides, strict=True) if overrides else None
    rendered = preview(db, key, clean, user)
    deliver(db, user.email, f"[Test] {rendered['subject']}", rendered["html"], rendered["text"], raise_errors=True)
    log_activity(db, "test_sent", request=request, subject_type=SUBJECT, subject_label=d["label"],
                 description=f"Sent a test of the “{d['label']}” email to {user.email}")
    db.commit()
    return {"status": True, "message": f"Test sent to {user.email} with example details. It may take a minute to arrive."}
