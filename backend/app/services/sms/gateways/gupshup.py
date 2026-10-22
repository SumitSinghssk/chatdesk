import urllib.parse

from app.services.sms.base import GatewayField, SmsGateway, SmsMessage


class GupshupGateway(SmsGateway):
    key = "gupshup"
    label = "Gupshup"
    website = "https://www.gupshup.io"
    fields = (
        GatewayField("user_id", "User ID", required=True),
        GatewayField("password", "Password", required=True, secret=True),
        GatewayField("sender_id", "Sender ID (mask)"),
        GatewayField("entity_id", "DLT entity ID"),
    )
    template_id_label = "DLT template ID"

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        params = {"method": "SendMessage", "send_to": message.digits, "msg": message.text, "msg_type": "TEXT",
                  "userid": cfg["user_id"], "auth_scheme": "plain", "password": cfg["password"], "v": "1.1",
                  "format": "json", "mask": cfg.get("sender_id"), "principalEntityId": cfg.get("entity_id"),
                  "dltTemplateId": message.template_id}
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
        status, data, text = self.http(f"https://enterprise.smsgupshup.com/GatewayAPI/rest?{query}", method="GET")
        result = data.get("response") or {}
        ok = result.get("status") == "success" if result else text.strip().lower().startswith("success")
        if status >= 300 or not ok:
            raise self.error(status, data, text, result.get("details"))
        return result.get("id")
