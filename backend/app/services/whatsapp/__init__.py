"""WhatsApp Cloud API: the one place that talks to Meta's Graph API.

    from app.services.whatsapp import WhatsAppClient, WhatsAppError, verify_signature

    client = WhatsAppClient(phone_number_id, access_token)
    client.phone_number()                 # display number, verified name, quality
    client.send_text("919876543210", "Hello")
"""

from app.services.whatsapp.client import (
    GRAPH_API_VERSION,
    MEDIA_LIMITS,
    WhatsAppClient,
    WhatsAppError,
    media_kind,
)
from app.services.whatsapp.signature import verify_signature

__all__ = ["GRAPH_API_VERSION", "MEDIA_LIMITS", "WhatsAppClient", "WhatsAppError", "media_kind",
           "verify_signature"]
