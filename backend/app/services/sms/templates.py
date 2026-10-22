from dataclasses import dataclass


@dataclass(frozen=True)
class SmsTemplate:
    key: str
    label: str
    description: str
    body: str
    variables: tuple[str, ...]
    sensitive: tuple[str, ...] = ()

    def spec(self) -> dict:
        return {"key": self.key, "label": self.label, "description": self.description, "body": self.body,
                "variables": list(self.variables)}


SMS_TEMPLATES: dict[str, SmsTemplate] = {
    t.key: t
    for t in (
        SmsTemplate(
            "login_otp", "Login code", "Sent when a customer signs in or signs up with their mobile number.",
            "{code} is your {app} login code. It is valid for {minutes} minutes. Do not share it with anyone.",
            ("code", "app", "minutes"), sensitive=("code",),
        ),
        SmsTemplate(
            "phone_verification", "Mobile verification", "Sent when a customer adds or changes their mobile number.",
            "{code} is your {app} verification code. It is valid for {minutes} minutes.",
            ("code", "app", "minutes"), sensitive=("code",),
        ),
    )
}


def render(body: str, variables: dict[str, str]) -> str:
    text = body
    for key, value in variables.items():
        text = text.replace("{" + key + "}", str(value))
    return text
