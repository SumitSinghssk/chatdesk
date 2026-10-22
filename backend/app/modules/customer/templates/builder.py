"""Converts between the template editor's form and Meta's `components` format, and checks a form
against Meta's rules before it is submitted (so most rejections are caught here, with a clear
message on the right field, instead of coming back from Meta).
"""

import re

from app.modules.customer.templates.schemas import TemplateSchema

VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
NAMED = re.compile(r"^[a-z_][a-z0-9_]*$")
PHONE = re.compile(r"^\+[1-9]\d{6,18}$")
CODE = re.compile(r"^[A-Za-z0-9]{1,15}$")
MEDIA_FORMATS = ("image", "video", "document")
BUTTON_LIMITS = {"quick_reply": 10, "url": 2, "phone_number": 1, "copy_code": 1, "otp": 1}
BUTTON_NAMES = {"quick_reply": "quick reply", "url": "website", "phone_number": "call", "copy_code": "copy code",
                "otp": "one-time password"}
AUTH_BODY = "*{{1}}* is your verification code."
AUTH_SECURITY = " For your security, do not share this code."
OTP_URL = "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}"


def variables(text: str | None) -> list[str]:
    """Variable names in order of first use: "Hi {{1}}, {{2}} and {{1}}" -> ["1", "2"]."""
    return list(dict.fromkeys(VAR.findall(text or "")))


def auth_texts(add_security: bool, expires: int | None) -> tuple[str, str | None]:
    body = AUTH_BODY + (AUTH_SECURITY if add_security else "")
    footer = f"This code expires in {expires} minutes." if expires else None
    return body, footer


# Validation --------------------------------------------------------------------------

def _check_variables(errors: dict, field: str, text: str, names: list[str], fmt: str, label: str) -> None:
    if fmt == "positional":
        if any(not n.isdigit() for n in names):
            errors[field] = f"Use numbered variables like {{{{1}}}} in the {label}, or switch to named variables"
        elif sorted(int(n) for n in names) != list(range(1, len(names) + 1)):
            errors[field] = f"Number the {label} variables in order: {{{{1}}}}, {{{{2}}}}, {{{{3}}}}…"
    elif any(n.isdigit() or not NAMED.match(n) for n in names):
        errors[field] = "Named variables use lowercase letters and underscores, like {{first_name}}"
    stripped = text.strip()
    if field not in errors and names and (stripped.startswith("{{") or stripped.endswith("}}")):
        errors[field] = f"The {label} can't start or end with a variable. Add a few words before or after it."
    if field not in errors and re.search(r"\}\}\s*\{\{", text):
        errors[field] = f"Put some words between variables in the {label}"


def validate(form: TemplateSchema, has_sample: bool) -> dict[str, str]:
    """Errors keyed by form field, e.g. {"body": "...", "buttons.1.url": "..."}. Empty = ready."""
    errors: dict[str, str] = {}
    if not form.name or not re.fullmatch(r"[a-z0-9_]+", form.name):
        errors["name"] = "Use lowercase letters, numbers and underscores, e.g. order_update"

    if form.category == "authentication":
        if form.code_expiration_minutes is not None and not 1 <= form.code_expiration_minutes <= 90:
            errors["code_expiration_minutes"] = "Choose between 1 and 90 minutes"
        return errors

    body = form.body or ""
    if not body.strip():
        errors["body"] = "Write the message body"
    else:
        names = variables(body)
        _check_variables(errors, "body", body, names, form.parameter_format, "body")
        for name in names:
            if not form.examples.get(name):
                errors[f"examples.{name}"] = "Add a sample value. Meta uses it to review the template."
        if len(names) and len(body.split()) < len(names) * 3:
            errors.setdefault("body", "Too many variables for such a short message. Add more words.")

    header = form.header
    if header.format == "text":
        if not header.text:
            errors["header.text"] = "Write the header text, or choose no header"
        else:
            names = variables(header.text)
            if len(names) > 1:
                errors["header.text"] = "The header can have only one variable"
            elif names:
                if form.parameter_format == "positional" and names != ["1"]:
                    errors["header.text"] = "Use {{1}} for the header variable"
                elif form.parameter_format == "named" and not NAMED.match(names[0]):
                    errors["header.text"] = "Named variables use lowercase letters and underscores"
                elif not header.example:
                    errors["header.example"] = "Add a sample value for the header variable"
    elif header.format in MEDIA_FORMATS and not has_sample:
        errors["sample"] = f"Upload a sample {'PDF' if header.format == 'document' else header.format}"

    if form.footer and VAR.search(form.footer):
        errors["footer"] = "The footer can't have variables"

    counts: dict[str, int] = {}
    seen_text: set[str] = set()
    for i, button in enumerate(form.buttons):
        counts[button.type] = counts.get(button.type, 0) + 1
        key = f"buttons.{i}"
        if button.type == "otp":
            errors[f"{key}.text"] = "One-time password buttons are only for authentication templates"
            continue
        if button.type != "copy_code":
            if not button.text:
                errors[f"{key}.text"] = "Add the button text"
            elif button.text.lower() in seen_text:
                errors[f"{key}.text"] = "Two buttons can't have the same text"
            seen_text.add(button.text.lower())
        if button.type == "url":
            url = button.url or ""
            if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", url.replace("{{1}}", "x")):
                errors[f"{key}.url"] = "Enter a full link starting with https://"
            elif VAR.search(url):
                if not url.endswith("{{1}}") or len(VAR.findall(url)) > 1:
                    errors[f"{key}.url"] = "A link can have one variable, {{1}}, at the very end"
                elif not button.example:
                    errors[f"{key}.example"] = "Add a sample value for the end of the link"
        elif button.type == "phone_number":
            if not PHONE.match((button.phone_number or "").replace(" ", "")):
                errors[f"{key}.phone_number"] = "Enter the number with country code, e.g. +919876543210"
        elif button.type == "copy_code":
            if not CODE.match(button.example or ""):
                errors[f"{key}.example"] = "Enter a sample code: up to 15 letters or numbers"
    for kind, n in counts.items():
        if n > BUTTON_LIMITS[kind]:
            errors["buttons"] = f"Only {BUTTON_LIMITS[kind]} {BUTTON_NAMES[kind]} button" \
                                f"{'s' if BUTTON_LIMITS[kind] > 1 else ''} allowed"
    return errors


# Form -> Meta components ----------------------------------------------------------------

def _example_values(names: list[str], values: dict[str, str], fmt: str, kind: str):
    if fmt == "named":
        return {f"{kind}_text_named_params": [{"param_name": n, "example": values.get(n, "")} for n in names]}
    ordered = [values.get(n, "") for n in sorted(names, key=int)] if all(n.isdigit() for n in names) else \
        [values.get(n, "") for n in names]
    return {f"{kind}_text": [ordered] if kind == "body" else ordered}


def build_components(form: TemplateSchema, header_handle: str | None = None) -> list[dict]:
    """Meta's `components` for this form. `header_handle` is the uploaded sample (media headers)."""
    if form.category == "authentication":
        body = {"type": "BODY", "add_security_recommendation": form.add_security_recommendation}
        components = [body]
        if form.code_expiration_minutes:
            components.append({"type": "FOOTER", "code_expiration_minutes": form.code_expiration_minutes})
        components.append({"type": "BUTTONS", "buttons": [
            {"type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code"}]})
        return components

    components: list[dict] = []
    header = form.header
    if header.format == "text" and header.text:
        part: dict = {"type": "HEADER", "format": "TEXT", "text": header.text}
        names = variables(header.text)
        if names:
            part["example"] = _example_values(names, {names[0]: header.example or ""}, form.parameter_format,
                                              "header")
        components.append(part)
    elif header.format in MEDIA_FORMATS:
        part = {"type": "HEADER", "format": header.format.upper()}
        if header_handle:
            part["example"] = {"header_handle": [header_handle]}
        components.append(part)
    elif header.format == "location":
        components.append({"type": "HEADER", "format": "LOCATION"})

    body: dict = {"type": "BODY", "text": form.body}
    names = variables(form.body)
    if names:
        body["example"] = _example_values(names, form.examples, form.parameter_format, "body")
    components.append(body)

    if form.footer:
        components.append({"type": "FOOTER", "text": form.footer})

    buttons = []
    for b in form.buttons:
        if b.type == "quick_reply":
            buttons.append({"type": "QUICK_REPLY", "text": b.text})
        elif b.type == "url":
            item = {"type": "URL", "text": b.text, "url": b.url or ""}
            if VAR.search(b.url or ""):
                item["example"] = [VAR.sub(b.example or "", b.url or "")]
            buttons.append(item)
        elif b.type == "phone_number":
            buttons.append({"type": "PHONE_NUMBER", "text": b.text,
                            "phone_number": (b.phone_number or "").replace(" ", "")})
        elif b.type == "copy_code":
            buttons.append({"type": "COPY_CODE", "example": b.example or ""})
    if buttons:
        components.append({"type": "BUTTONS", "buttons": buttons})
    return components


# Meta components -> form ----------------------------------------------------------------

SUPPORTED_BUTTONS = {"QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "OTP"}


def parse(components: list[dict], category: str, parameter_format: str) -> dict:
    """The editor's form for stored components. `supported` is False for template kinds the editor
    can't change yet (carousels, flows, catalogs...); those still preview and send."""
    parts = {(c.get("type") or "").upper(): c for c in components or []}
    supported = not ({"CAROUSEL", "LIMITED_TIME_OFFER"} & set(parts))
    form: dict = {
        "header": {"format": "none", "text": None, "example": None},
        "body": "",
        "examples": {},
        "footer": None,
        "buttons": [],
        "add_security_recommendation": False,
        "code_expiration_minutes": None,
        "media_url": None,  # Meta-hosted sample for templates made in WhatsApp Manager
        "supported": supported,
    }

    header = parts.get("HEADER")
    if header:
        fmt = (header.get("format") or "TEXT").lower()
        form["header"]["format"] = fmt
        example = header.get("example") or {}
        if fmt == "text":
            form["header"]["text"] = header.get("text")
            named = example.get("header_text_named_params") or []
            values = [p.get("example") for p in named] or example.get("header_text") or []
            form["header"]["example"] = values[0] if values else None
        elif fmt in MEDIA_FORMATS:
            handles = example.get("header_handle") or []
            form["media_url"] = handles[0] if handles and str(handles[0]).startswith("http") else None

    body = parts.get("BODY") or {}
    footer = parts.get("FOOTER") or {}
    if category == "authentication":
        security = bool(body.get("add_security_recommendation")) or AUTH_SECURITY.strip() in (body.get("text") or "")
        expires = footer.get("code_expiration_minutes")
        if expires is None and footer.get("text"):
            found = re.search(r"(\d+)", footer["text"])
            expires = int(found.group(1)) if found else None
        form["add_security_recommendation"] = security
        form["code_expiration_minutes"] = expires
        form["body"], form["footer"] = auth_texts(security, expires)
        form["body"] = body.get("text") or form["body"]
        form["buttons"] = [{"type": "otp", "text": "Copy code", "url": None, "phone_number": None, "example": None}]
        return form

    form["body"] = body.get("text") or ""
    example = body.get("example") or {}
    named = example.get("body_text_named_params")
    if named:
        form["examples"] = {p.get("param_name"): p.get("example") or "" for p in named}
    else:
        values = (example.get("body_text") or [[]])[0] or []
        names = sorted((n for n in variables(form["body"]) if n.isdigit()), key=int)
        form["examples"] = {n: values[i] for i, n in enumerate(names) if i < len(values)}
    form["footer"] = footer.get("text")

    for b in (parts.get("BUTTONS") or {}).get("buttons") or []:
        kind = (b.get("type") or "").upper()
        if kind not in SUPPORTED_BUTTONS:
            form["supported"] = False
            form["buttons"].append({"type": "other", "text": b.get("text") or kind.title(), "url": None,
                                    "phone_number": None, "example": None})
            continue
        item = {"type": kind.lower(), "text": b.get("text") or "", "url": b.get("url"),
                "phone_number": b.get("phone_number"), "example": None}
        if kind == "URL" and VAR.search(b.get("url") or ""):
            sample = (b.get("example") or [""])[0] or ""
            prefix = VAR.split(b["url"])[0]
            item["example"] = sample[len(prefix):] if sample.startswith(prefix) else sample
        elif kind == "COPY_CODE":
            examples = b.get("example")
            item["example"] = examples[0] if isinstance(examples, list) and examples else examples
            item["text"] = b.get("text") or "Copy offer code"
        form["buttons"].append(item)
    return form


def send_params(form: dict) -> dict:
    """What the sender has to fill in when sending: header/body variables and button values."""
    header = form["header"]
    buttons = []
    for i, b in enumerate(form["buttons"]):
        if b["type"] == "url" and VAR.search(b.get("url") or ""):
            buttons.append({"index": i, "type": "url", "label": b["text"], "example": b.get("example")})
        elif b["type"] == "copy_code":
            buttons.append({"index": i, "type": "copy_code", "label": "Coupon code", "example": b.get("example")})
    return {
        "header": variables(header.get("text")) if header["format"] == "text" else [],
        "body": ordered(variables(form["body"])),
        "buttons": buttons,
    }


def ordered(names: list[str]) -> list[str]:
    """Numbered variables go to Meta in number order ({{1}} first), named ones in order of use."""
    return sorted(names, key=int) if names and all(n.isdigit() for n in names) else names
