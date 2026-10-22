from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class PaymentSettingsSchema(BaseModel):
    currency: str = Field("INR", pattern=r"^[A-Za-z]{3}$")
    default_gateway: Optional[str] = Field(None, max_length=30)
    gateways: dict[str, dict[str, Optional[str | bool]]] = {}

    @field_validator("gateways")
    @classmethod
    def _clean(cls, v: dict) -> dict:
        return {
            key: {name: value if isinstance(value, bool) or value is None else str(value).strip()[:500]
                  for name, value in values.items()}
            for key, values in v.items()
        }


class GatewaySchema(BaseModel):
    gateway: str = Field(..., max_length=30)


class TestCheckoutSchema(BaseModel):
    gateway: Optional[str] = Field(None, max_length=30)
    amount: float = Field(1, ge=1, le=100000)
    currency: Optional[str] = Field(None, pattern=r"^[A-Za-z]{3}$")


class ConfirmSchema(BaseModel):
    gateway: str = Field(..., max_length=30)
    data: dict[str, Any]


class FailureSchema(BaseModel):
    gateway: str = Field(..., max_length=30)
    order_id: str = Field(..., max_length=100)
    error: Optional[str] = Field(None, max_length=1000)
