import base64
import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from app.services.fields import GatewayField

TIMEOUT = 20


class PaymentError(Exception):
    pass


@dataclass
class OrderRequest:
    amount: int
    currency: str
    receipt: str
    description: str = ""
    notes: dict[str, str] = field(default_factory=dict)
    payer: dict[str, str] = field(default_factory=dict)


@dataclass
class GatewayOrder:
    order_id: str
    amount: int
    currency: str
    raw: dict


@dataclass
class PaymentResult:
    paid: bool
    order_id: str | None
    payment_id: str | None
    status: str
    method: str | None = None
    error: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class WebhookEvent:
    event_id: str | None
    event: str
    order_id: str | None
    payment_id: str | None
    status: str | None
    method: str | None
    error: str | None
    amount: int | None
    raw: dict


class PaymentGateway:
    key: str = ""
    label: str = ""
    website: str = ""
    dashboard_url: str = ""
    fields: tuple[GatewayField, ...] = ()
    webhook_events: tuple[str, ...] = ()
    currencies: tuple[str, ...] = ("INR",)

    def missing(self, cfg: dict) -> list[str]:
        return [f.label for f in self.fields if f.required and not str(cfg.get(f.name) or "").strip()]

    def is_test_mode(self, cfg: dict) -> bool:
        return False

    def test_connection(self, cfg: dict) -> str:
        raise NotImplementedError

    def create_order(self, cfg: dict, order: OrderRequest) -> GatewayOrder:
        raise NotImplementedError

    def checkout(self, cfg: dict, order: GatewayOrder, request: OrderRequest, branding: dict) -> dict:
        raise NotImplementedError

    def verify_payment(self, cfg: dict, data: dict) -> PaymentResult:
        raise NotImplementedError

    def verify_webhook(self, cfg: dict, body: bytes, headers: dict) -> bool:
        raise NotImplementedError

    def parse_webhook(self, body: bytes, headers: dict) -> WebhookEvent:
        raise NotImplementedError

    def spec(self) -> dict:
        return {"key": self.key, "label": self.label, "website": self.website, "dashboard_url": self.dashboard_url,
                "fields": [f.spec() for f in self.fields], "webhook_events": list(self.webhook_events),
                "currencies": list(self.currencies)}

    @staticmethod
    def http(url: str, *, method: str = "GET", body: dict | None = None,
             basic: tuple[str, str] | None = None) -> tuple[int, dict, str]:
        headers = {"Accept": "application/json", "User-Agent": "starter-kit-payments/1.0"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if basic:
            token = base64.b64encode(f"{basic[0]}:{basic[1]}".encode("utf-8")).decode("ascii")
            headers["Authorization"] = f"Basic {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                status, text = res.status, res.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            status, text = exc.code, exc.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, OSError) as exc:
            raise PaymentError(f"Couldn't connect: {getattr(exc, 'reason', exc)}")
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = {}
        return status, parsed if isinstance(parsed, dict) else {}, text
