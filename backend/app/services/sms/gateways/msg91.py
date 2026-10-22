from app.services.sms.base import GatewayField, SmsGateway, SmsMessage


class Msg91Gateway(SmsGateway):
    key = "msg91"
    label = "MSG91"
    website = "https://msg91.com"
    fields = (
        GatewayField("auth_key", "Auth key", required=True, secret=True),
        GatewayField("sender_id", "Sender ID", help="6-letter DLT approved header, e.g. SKSITE"),
    )
    template_id_label = "Flow template ID"
    template_id_help = "Use ##variable## placeholders in the MSG91 template, e.g. ##code##."

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        if not message.template_id:
            raise self.error(0, {}, "", "Add the MSG91 flow template ID for this message")
        body = {"template_id": message.template_id, "short_url": "0",
                "recipients": [{"mobiles": message.digits, **message.variables}]}
        if cfg.get("sender_id"):
            body["sender"] = cfg["sender_id"]
        status, data, text = self.http("https://control.msg91.com/api/v5/flow", body=body,
                                       headers={"authkey": cfg["auth_key"]})
        if status >= 300 or data.get("type") == "error":
            raise self.error(status, data, text)
        return data.get("message") if isinstance(data.get("message"), str) else None
