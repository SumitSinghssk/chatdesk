from app.services.sms.base import GatewayField, SmsGateway, SmsMessage


class Fast2SmsGateway(SmsGateway):
    key = "fast2sms"
    label = "Fast2SMS"
    website = "https://www.fast2sms.com"
    fields = (
        GatewayField("api_key", "API key", required=True, secret=True),
        GatewayField("route", "Route", default="dlt",
                     options=(("dlt", "DLT (registered template)"), ("otp", "OTP (code only)"),
                              ("q", "Quick SMS (plain text)")),
                     help="DLT needs a sender ID and message ID. OTP sends only the code."),
        GatewayField("sender_id", "Sender ID", help="Required for the DLT route"),
    )
    template_id_label = "DLT message ID"
    template_id_help = "The message ID shown in Fast2SMS → DLT manager. Variables are sent in order."

    def send(self, cfg: dict, message: SmsMessage) -> str | None:
        route = cfg.get("route") or "dlt"
        if route == "otp":
            code = message.variables.get("code")
            if not code:
                raise self.error(0, {}, "", "The OTP route can only send verification codes")
            body = {"route": "otp", "variables_values": code, "numbers": message.national}
        elif route == "dlt":
            if not cfg.get("sender_id") or not message.template_id:
                raise self.error(0, {}, "", "The DLT route needs a sender ID and a DLT message ID")
            body = {"route": "dlt", "sender_id": cfg["sender_id"], "message": message.template_id,
                    "variables_values": "|".join(message.variables.values()), "numbers": message.national,
                    "flash": "0"}
        else:
            body = {"route": "q", "message": message.text, "numbers": message.national, "flash": "0"}
        status, data, text = self.http("https://www.fast2sms.com/dev/bulkV2", body=body,
                                       headers={"authorization": cfg["api_key"]})
        if status >= 300 or data.get("return") is not True:
            raise self.error(status, data, text)
        return data.get("request_id")
