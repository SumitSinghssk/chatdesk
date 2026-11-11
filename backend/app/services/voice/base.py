"""What a calling provider (Exotel, ...) has to do for the Calls module.

The provider account belongs to the business (they sign up and finish KYC with the provider themselves),
so every method gets that business's saved config. Webhooks are never trusted on their own: the call is
always looked up again with `fetch()` using the business's credentials.
"""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

from app.services.fields import GatewayField

TIMEOUT = 15
MAX_RECORDING_BYTES = 200 * 1024 * 1024


class VoiceError(Exception):
    pass


@dataclass
class CallReport:
    """One call as the provider sees it, in the provider's own words turned into ours."""

    sid: str
    direction: str = "inbound"  # inbound | outbound
    from_number: str | None = None
    to_number: str | None = None
    customer_number: str | None = None  # the outside party (the caller, or who we called)
    provider_status: str | None = None
    ended: bool = False
    # Did the outside party actually talk? None while the call is still going on.
    answered: bool | None = None
    # False when the outside party's phone never rang (a click-to-call the business didn't pick up)
    customer_rung: bool = True
    duration: int = 0  # seconds both sides were connected
    started_at: datetime | None = None
    ended_at: datetime | None = None
    recording_url: str | None = None
    raw: dict = field(default_factory=dict)


class VoiceGateway:
    key: str = ""
    label: str = ""
    website: str = ""
    fields: tuple[GatewayField, ...] = ()
    # Shown under the connection form: how to point the provider at our callback URL
    setup_help: str = ""

    def missing(self, cfg: dict) -> list[str]:
        return [f.label for f in self.fields if f.required and not str(cfg.get(f.name) or "").strip()]

    def spec(self) -> dict:
        return {"key": self.key, "label": self.label, "website": self.website,
                "fields": [f.spec() for f in self.fields], "setup_help": self.setup_help}

    # provider API -------------------------------------------------------------------------------

    def check(self, cfg: dict) -> str:
        """Checks the credentials work. Returns a short description of the account."""
        raise NotImplementedError

    def start_call(self, cfg: dict, *, agent: str, customer: str, callback_url: str, record: bool) -> str:
        """Rings `agent` (the business) first, then connects `customer`. Returns the call id."""
        raise NotImplementedError

    def call_sid(self, params: dict) -> str | None:
        """The call id in a callback (query string, form or JSON, merged into `params`)."""
        raise NotImplementedError

    def fetch(self, cfg: dict, sid: str, params: dict | None = None) -> CallReport:
        """The call, read back from the provider. `params` are the callback's values, used only for
        details the provider's API doesn't return."""
        raise NotImplementedError

    def download(self, cfg: dict, url: str) -> tuple[bytes, str]:
        """(file bytes, mime type) of a call recording."""
        raise NotImplementedError

    # helpers ------------------------------------------------------------------------------------

    @staticmethod
    def request(url: str, *, method: str = "GET", form: dict | None = None,
                basic: tuple[str, str] | None = None, raw: bool = False) -> tuple[int, dict | bytes, str]:
        """(status, parsed JSON dict or raw bytes, content type)."""
        data = None
        headers = {"Accept": "*/*" if raw else "application/json", "User-Agent": "chatdesk-voice/1.0"}
        if form is not None:
            data = urllib.parse.urlencode({k: v for k, v in form.items() if v not in (None, "")},
                                          doseq=True).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if basic:
            token = base64.b64encode(f"{basic[0]}:{basic[1]}".encode("utf-8")).decode("ascii")
            headers["Authorization"] = f"Basic {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                status, ctype = res.status, res.headers.get("Content-Type", "")
                body = res.read(MAX_RECORDING_BYTES + 1)
        except urllib.error.HTTPError as exc:
            status, ctype, body = exc.code, exc.headers.get("Content-Type", ""), exc.read()
        except (urllib.error.URLError, OSError) as exc:
            raise VoiceError(f"Couldn't connect: {getattr(exc, 'reason', exc)}")
        if len(body) > MAX_RECORDING_BYTES:
            raise VoiceError("The file is too large")
        if raw and status < 300:
            return status, body, ctype
        try:
            parsed = json.loads(body.decode("utf-8", errors="replace"))
        except ValueError:
            parsed = {}
        return status, parsed if isinstance(parsed, dict) else {}, ctype
