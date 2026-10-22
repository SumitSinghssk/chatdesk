import re


def normalize_phone(raw: str | None, country_code: str = "91") -> str | None:
    value = (raw or "").strip()
    digits = re.sub(r"\D", "", value)
    if not digits:
        return None
    if value.startswith("00"):
        digits = digits[2:]
    elif not value.startswith("+"):
        digits = digits.lstrip("0")
        if len(digits) <= 10:
            digits = re.sub(r"\D", "", country_code or "") + digits
    if not 8 <= len(digits) <= 15:
        return None
    return f"+{digits}"


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return phone[:-6] + "••••" + phone[-2:] if len(phone) > 8 else phone
