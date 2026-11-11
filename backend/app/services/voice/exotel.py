"""Exotel (https://exotel.com), the business's own account.

API notes (developer.exotel.com):
- Connect two numbers: POST /v1/Accounts/{sid}/Calls/connect.json rings `From` (the business) first, then
  `To` (the customer), showing `CallerId` (the ExoPhone). StatusCallback is POSTed at the end.
- Inbound calls run a Flow; a Passthru applet after the Connect applet calls our URL (GET by default).
- Call details: GET /v1/Accounts/{sid}/Calls/{CallSid}.json?details=true. `Details.Leg2Status` and
  `Details.ConversationDuration` tell whether the second party really talked. Callbacks aren't signed,
  so the call is always read back from here before anything happens.
- Recording URLs need the API key and token (basic auth) since October 2024.
- Times are in the account's timezone (IST for Indian accounts).
"""
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.fields import GatewayField
from app.services.voice.base import CallReport, VoiceError, VoiceGateway

TERMINAL = {"completed", "failed", "busy", "no-answer", "canceled"}
EXOTEL_TZ = ZoneInfo("Asia/Kolkata")
# Recordings are fetched with the account's credentials, so only from Exotel's own hosts
RECORDING_HOSTS = (".exotel.com", ".exotel.in")


def _host(cfg: dict) -> str:
    return (cfg.get("subdomain") or "api.exotel.com").strip().removeprefix("https://").rstrip("/")


def _time(value) -> datetime | None:
    if not value or not isinstance(value, str) or value.startswith("1970"):
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            local = datetime.strptime(value[:19], fmt).replace(tzinfo=EXOTEL_TZ)
        except ValueError:
            continue
        return local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return None


def _int(value) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


def _status(value) -> str | None:
    return str(value).strip().lower() if value not in (None, "") else None


def _leg_status(params: dict, index: int) -> str | None:
    legs = params.get("Legs")
    if isinstance(legs, list) and len(legs) > index and isinstance(legs[index], dict):
        return _status(legs[index].get("Status"))
    return _status(params.get(f"Legs[{index}][Status]"))


def safe_recording_url(url: str | None) -> str | None:
    if not url:
        return None
    parts = urllib.parse.urlsplit(url.strip())
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not any(host == h[1:] or host.endswith(h) for h in RECORDING_HOSTS):
        return None
    return url.strip()


class ExotelGateway(VoiceGateway):
    key = "exotel"
    label = "Exotel"
    website = "https://exotel.com"
    fields = (
        GatewayField("account_sid", "Account SID", required=True,
                     help="Exotel dashboard → API settings."),
        GatewayField("api_key", "API key", required=True),
        GatewayField("api_token", "API token", required=True, secret=True),
        GatewayField("subdomain", "API host", default="api.in.exotel.com",
                     help="The region your Exotel account was created in.",
                     options=(("api.in.exotel.com", "Mumbai (api.in.exotel.com)"),
                              ("api.exotel.com", "Singapore (api.exotel.com)"))),
        GatewayField("caller_id", "ExoPhone", required=True,
                     help="Your Exotel virtual number. Customers see it when you call them."),
    )
    setup_help = ("Calls you start from here report back by themselves. For calls customers make to your "
                  "ExoPhone, open its Flow in Exotel App Bazaar and add a Passthru applet after the Connect "
                  "applet (and on the hang-up path) with the callback URL below.")

    def _base(self, cfg: dict) -> str:
        return f"https://{_host(cfg)}/v1/Accounts/{urllib.parse.quote(str(cfg['account_sid']).strip())}"

    def _auth(self, cfg: dict) -> tuple[str, str]:
        return str(cfg["api_key"]).strip(), str(cfg["api_token"]).strip()

    @staticmethod
    def _error(status: int, data: dict, fallback: str) -> VoiceError:
        rest = data.get("RestException") or {}
        message = rest.get("Message") or data.get("message") or fallback
        if status in (401, 403):
            message = "Exotel refused the API key or token"
        return VoiceError(f"HTTP {status}: {message}")

    def check(self, cfg: dict) -> str:
        status, data, _ = self.request(f"{self._base(cfg)}/Calls.json?PageSize=1", basic=self._auth(cfg))
        if status == 404:
            raise VoiceError("Exotel couldn't find this account. Check the Account SID and the API host.")
        if status >= 300:
            raise self._error(status, data, "Couldn't reach your Exotel account")
        return f"Exotel account {cfg['account_sid']}"

    def start_call(self, cfg: dict, *, agent: str, customer: str, callback_url: str, record: bool) -> str:
        form = {
            "From": f"+{agent.lstrip('+')}",
            "To": f"+{customer.lstrip('+')}",
            "CallerId": str(cfg["caller_id"]).strip(),
            "CallType": "trans",
            "Record": "true" if record else "false",
            "StatusCallback": callback_url,
            "StatusCallbackEvents[0]": "terminal",
            "StatusCallbackContentType": "application/json",
        }
        status, data, _ = self.request(f"{self._base(cfg)}/Calls/connect.json", method="POST", form=form,
                                       basic=self._auth(cfg))
        if status >= 300:
            raise self._error(status, data, "Exotel didn't start the call")
        sid = (data.get("Call") or {}).get("Sid")
        if not sid:
            raise VoiceError("Exotel didn't return a call id")
        return str(sid)

    def call_sid(self, params: dict) -> str | None:
        sid = params.get("CallSid") or params.get("Sid")
        return str(sid).strip() if sid else None

    def fetch(self, cfg: dict, sid: str, params: dict | None = None) -> CallReport:
        params = params or {}
        url = f"{self._base(cfg)}/Calls/{urllib.parse.quote(sid)}.json?details=true"
        status, data, _ = self.request(url, basic=self._auth(cfg))
        if status == 404:
            raise VoiceError("Exotel has no call with this id")
        if status >= 300:
            raise self._error(status, data, "Couldn't read the call from Exotel")
        call = data.get("Call") or {}
        if not call.get("Sid"):
            raise VoiceError("Exotel returned no call details")
        details = call.get("Details") or {}

        direction = "inbound" if _status(call.get("Direction")) in ("inbound", "incoming") else "outbound"
        from_number, to_number = call.get("From"), call.get("To")
        provider_status = _status(call.get("Status"))
        leg1 = _status(details.get("Leg1Status")) or _leg_status(params, 0)
        leg2 = _status(details.get("Leg2Status")) or _leg_status(params, 1)
        customer_rung = True
        dial_status = _status(params.get("DialCallStatus"))
        talked = _int(details.get("ConversationDuration") or params.get("ConversationDuration")
                      or params.get("DialCallDuration"))

        if direction == "outbound":
            # Connect API: leg 1 is the business, leg 2 the customer
            customer_number = to_number
            ended = provider_status in TERMINAL
            answered = leg2 == "completed" and talked > 0
            # Exotel dials the customer only after the business picks up
            customer_rung = leg1 == "completed" or leg2 is not None
        else:
            # A Flow: leg 1 is the caller, leg 2 whoever the Connect applet rang. The Passthru after the
            # Connect applet arrives while the caller may still be on the line, so its DialCallStatus
            # also means "the ringing part is over".
            customer_number = from_number or params.get("CallFrom")
            ended = provider_status in TERMINAL or dial_status is not None
            answered = (leg2 == "completed" or dial_status == "completed") and talked > 0

        return CallReport(
            sid=str(call["Sid"]),
            direction=direction,
            from_number=from_number,
            to_number=to_number,
            customer_number=customer_number,
            provider_status=provider_status,
            ended=ended,
            answered=answered if ended else None,
            customer_rung=customer_rung,
            duration=talked,
            started_at=_time(call.get("StartTime")),
            ended_at=_time(call.get("EndTime")),
            recording_url=safe_recording_url(call.get("RecordingUrl"))
            or safe_recording_url(call.get("PreSignedRecordingUrl"))
            or safe_recording_url(params.get("RecordingUrl")),
            raw={"call": call, "callback": params},
        )

    def download(self, cfg: dict, url: str) -> tuple[bytes, str]:
        safe = safe_recording_url(url)
        if not safe:
            raise VoiceError("Not an Exotel recording link")
        status, body, ctype = self.request(safe, basic=self._auth(cfg), raw=True)
        if status >= 300 or not isinstance(body, bytes) or not body:
            raise VoiceError(f"HTTP {status}: the recording isn't ready yet")
        mime = (ctype or "").split(";")[0].strip() or "audio/mpeg"
        return body, mime if mime.startswith("audio/") else "audio/mpeg"
