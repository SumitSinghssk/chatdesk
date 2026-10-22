from dataclasses import dataclass


@dataclass(frozen=True)
class GatewayField:
    name: str
    label: str
    required: bool = False
    secret: bool = False
    default: str = ""
    help: str = ""
    options: tuple[tuple[str, str], ...] = ()

    def spec(self) -> dict:
        return {"name": self.name, "label": self.label, "required": self.required, "secret": self.secret,
                "default": self.default, "help": self.help,
                "options": [{"value": v, "label": label} for v, label in self.options]}
