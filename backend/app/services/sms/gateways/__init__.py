from app.services.sms.base import SmsGateway
from app.services.sms.gateways.exotel import ExotelGateway
from app.services.sms.gateways.fast2sms import Fast2SmsGateway
from app.services.sms.gateways.gupshup import GupshupGateway
from app.services.sms.gateways.msg91 import Msg91Gateway
from app.services.sms.gateways.twilio import TwilioGateway

GATEWAYS: dict[str, SmsGateway] = {
    gateway.key: gateway
    for gateway in (Msg91Gateway(), Fast2SmsGateway(), ExotelGateway(), GupshupGateway(), TwilioGateway())
}
