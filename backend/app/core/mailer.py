import html as html_lib
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

MAIL_DISABLED_MESSAGE = "Email sending is turned off. Enable it in Settings → Email (SMTP)."
MAIL_CONNECT_ERROR = "Couldn't connect to the mail server. Check host, port, encryption and credentials."
_SECRET_PARAM = re.compile(r"([?&](?:token|code|key|secret|signature|sig)=)[^&\s]*", re.IGNORECASE)


def _redact_link(url: str) -> str:
    return _SECRET_PARAM.sub(r"\1<redacted>", url)


def _layout(heading: str, body_html: str, button: tuple[str, str] | None, app_name: str) -> str:
    button_html = ""
    if button:
        label, url = button
        button_html = (
            f'<p style="margin:28px 0"><a href="{html_lib.escape(url)}" style="background:#4f46e5;color:#fff;'
            f'padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">{html_lib.escape(label)}</a></p>'
        )
    return f"""<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px 32px">
<p style="margin:0 0 20px;font-weight:700;font-size:16px">{html_lib.escape(app_name)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">{html_lib.escape(heading)}</h1>
<div style="font-size:14px;line-height:1.6">{body_html}</div>{button_html}
</td></tr></table>
<p style="font-size:12px;color:#94a3b8;margin-top:16px">&copy; {html_lib.escape(app_name)}</p>
</td></tr></table></body></html>"""


def mail_enabled(db: Session) -> bool:
    from app.modules.admin.settings.service import get_group

    cfg = get_group(db, "mail")
    return bool(cfg.get("enabled") and cfg.get("host"))


def deliver(db: Session, to: str, subject: str, html: str, text: str, *, reply_to: str | None = None,
            raise_errors: bool = False) -> bool:
    from app.modules.admin.settings.service import get_group

    cfg = get_group(db, "mail", with_secrets=True, fresh=True)
    app_name = get_group(db, "general").get("app_name") or "Admin"

    if not cfg.get("enabled") or not cfg.get("host"):
        if settings.is_production:
            logger.warning("Mail disabled — not sending to %s: %s", to, subject)
        else:
            links = " ".join(_redact_link(u) for u in re.findall(r"https?://\S+", text or ""))
            logger.warning("Mail disabled — would send to %s: %s | %s", to, subject, links)
        if raise_errors:
            raise HTTPException(status_code=400, detail=MAIL_DISABLED_MESSAGE)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.get("from_name") or app_name, cfg.get("from_address") or cfg.get("username")))
    msg["To"] = to
    if reply_to or cfg.get("reply_to"):
        msg["Reply-To"] = reply_to or cfg["reply_to"]
    msg.set_content(text or subject)
    msg.add_alternative(html, subtype="html")

    try:
        port = int(cfg.get("port") or 587)
        if cfg.get("encryption") == "ssl":
            server = smtplib.SMTP_SSL(cfg["host"], port, context=ssl.create_default_context(), timeout=15)
        else:
            server = smtplib.SMTP(cfg["host"], port, timeout=15)
            if cfg.get("encryption") == "tls":
                server.starttls(context=ssl.create_default_context())
        with server:
            if cfg.get("username"):
                server.login(cfg["username"], cfg.get("password") or "")
            server.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Failed to send mail to %s: %s", to, exc)
        if raise_errors:
            raise HTTPException(status_code=400, detail=MAIL_CONNECT_ERROR)
        return False


def send_mail(db: Session, to: str, subject: str, heading: str, body_html: str,
              button: tuple[str, str] | None = None, *, raise_errors: bool = False) -> bool:
    from app.modules.admin.settings.service import get_group

    app_name = get_group(db, "general").get("app_name") or "Admin"
    text = re.sub(r"<[^>]+>", "", body_html.replace("</p>", "\n\n").replace("<br>", "\n")).strip()
    text = f"{heading}\n\n{html_lib.unescape(text)}" + (f"\n\n{button[0]}: {button[1]}" if button else "")
    return deliver(db, to, subject, _layout(heading, body_html, button, app_name), text, raise_errors=raise_errors)


def send_template(db: Session, key: str, to: str, variables: dict, *, url: str | None = None,
                  details: dict | None = None, raise_errors: bool = False) -> bool:
    from app.modules.admin.email_templates import service as templates

    if not templates.enabled(db, key):
        logger.info("Email template %s is turned off — not sending to %s", key, to)
        return False
    try:
        rendered = templates.render(db, key, variables, url=url,
                                    details=details if details is not None else templates.details_for(key, variables))
    except Exception as exc:
        logger.exception("Could not render email template %s: %s", key, exc)
        if raise_errors:
            raise
        return False
    return deliver(db, to, rendered["subject"], rendered["html"], rendered["text"], raise_errors=raise_errors)
