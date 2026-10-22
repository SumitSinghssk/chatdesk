from app.services.payments.base import PaymentGateway
from app.services.payments.gateways.razorpay import RazorpayGateway

PAYMENT_GATEWAYS: dict[str, PaymentGateway] = {gateway.key: gateway for gateway in (RazorpayGateway(),)}
