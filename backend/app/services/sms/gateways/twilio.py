import urllib.parse

from app.services.sms.base import GatewayField, SmsGateway, SmsMessage


class TwilioGateway(SmsGateway):
    key = "twilio"
    label = "Twilio"
    website = "https://www.twilio.com"
    fields = (
        GatewayField("account_sid", "Account SID", required=True),
        GatewayField("auth_token", "Auth token", required=True, secret=True),
        GatewayField("from_number", "From number", help="Your Twilio number in +E.164 format"),
        GatewayField("messaging_service_sid", "Messaging service SID", help="Used instead of the from number"),
    )

    def missing(self, cfg: dict) -> list[str]:
        missing = super().missing(cfg)
        if not (cfg.get("from_number") or cfg.get("messaging_service_sid")):
            missing.append("From number or messaging service SID")
        return missing

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        sid = cfg["account_sid"]
        form = {"To": message.phone, "Body": message.text}
        if cfg.get("messaging_service_sid"):
            form["MessagingServiceSid"] = cfg["messaging_service_sid"]
        else:
            form["From"] = cfg["from_number"]
        url = f"https://api.twilio.com/2010-04-01/Accounts/{urllib.parse.quote(sid)}/Messages.json"
        status, data, text = self.http(url, form=form, basic=(sid, cfg["auth_token"]))
        if status >= 300:
            raise self.error(status, data, text)
        return data.get("sid")
