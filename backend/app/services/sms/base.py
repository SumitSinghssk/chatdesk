import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from app.services.fields import GatewayField

TIMEOUT = 15


class SmsError(Exception):
    pass


@dataclass
class SmsMessage:
    phone: str
    text: str
    country_code: str = "91"
    template_key: str | None = None
    template_id: str | None = None
    variables: dict[str, str] = field(default_factory=dict)

    @property
    def digits(self) -> str:
        return self.phone.lstrip("+")

    @property
    def national(self) -> str:
        code = self.country_code or ""
        return self.digits[len(code):] if code and self.digits.startswith(code) else self.digits


class SmsGateway:
    key: str = ""
    label: str = ""
    website: str = ""
    fields: tuple[GatewayField, ...] = ()
    template_id_label: str | None = None
    template_id_help: str = ""

    def missing(self, cfg: dict) -> list[str]:
        return [f.label for f in self.fields if f.required and not str(cfg.get(f.name) or "").strip()]

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        raise NotImplementedError

    def spec(self) -> dict:
        return {"key": self.key, "label": self.label, "website": self.website,
                "fields": [f.spec() for f in self.fields],
                "template_id_label": self.template_id_label, "template_id_help": self.template_id_help}

    @staticmethod
    def http(url: str, *, method: str = "POST", form: dict | None = None, body: dict | None = None,
             headers: dict | None = None, basic: tuple[str, str] | None = None) -> tuple[int, dict, str]:
        data = None
        all_headers = {"Accept": "application/json", "User-Agent": "starter-kit-sms/1.0", **(headers or {})}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            all_headers["Content-Type"] = "application/json"
        elif form is not None:
            data = urllib.parse.urlencode({k: v for k, v in form.items() if v not in (None, "")}).encode("utf-8")
            all_headers["Content-Type"] = "application/x-www-form-urlencoded"
        if basic:
            token = base64.b64encode(f"{basic[0]}:{basic[1]}".encode("utf-8")).decode("ascii")
            all_headers["Authorization"] = f"Basic {token}"
        req = urllib.request.Request(url, data=data, headers=all_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                status, text = res.status, res.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            status, text = exc.code, exc.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, OSError) as exc:
            raise SmsError(f"Couldn't connect: {getattr(exc, 'reason', exc)}")
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = {}
        return status, parsed if isinstance(parsed, dict) else {}, text

    @staticmethod
    def error(status: int, data: dict, text: str, message: str | None = None) -> SmsError:
        detail = message or data.get("message") or data.get("error") or data.get("msg")
        if isinstance(detail, dict):
            detail = detail.get("message") or json.dumps(detail)
        if isinstance(detail, list):
            detail = ", ".join(map(str, detail))
        return SmsError(f"HTTP {status}: {detail or text.strip()[:200] or 'no response'}")
