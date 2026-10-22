import urllib.parse

from app.services.sms.base import GatewayField, SmsGateway, SmsMessage


class ExotelGateway(SmsGateway):
    key = "exotel"
    label = "Exotel"
    website = "https://exotel.com"
    fields = (
        GatewayField("account_sid", "Account SID", required=True),
        GatewayField("api_key", "API key", required=True),
        GatewayField("api_token", "API token", required=True, secret=True),
        GatewayField("subdomain", "API host", default="api.exotel.com",
                     options=(("api.exotel.com", "Singapore (api.exotel.com)"),
                              ("api.in.exotel.com", "Mumbai (api.in.exotel.com)"))),
        GatewayField("sender_id", "Sender ID", required=True),
        GatewayField("dlt_entity_id", "DLT entity ID"),
    )
    template_id_label = "DLT template ID"

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        host = (cfg.get("subdomain") or "api.exotel.com").strip().removeprefix("https://").rstrip("/")
        url = f"https://{host}/v1/Accounts/{urllib.parse.quote(cfg['account_sid'])}/Sms/send.json"
        form = {"From": cfg["sender_id"], "To": message.phone, "Body": message.text,
                "DltEntityId": cfg.get("dlt_entity_id"), "DltTemplateId": message.template_id}
        status, data, text = self.http(url, form=form, basic=(cfg["api_key"], cfg["api_token"]))
        if status >= 300:
            rest = data.get("RestException") or {}
            raise self.error(status, data, text, rest.get("Message"))
        return ((data.get("SMSMessage") or {}).get("Sid")) or None
