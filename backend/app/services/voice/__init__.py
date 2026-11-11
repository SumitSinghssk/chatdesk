"""Calling providers (the business connects its own account). Add one: subclass VoiceGateway in
services/voice/<name>.py and register it in GATEWAYS."""
from app.services.voice.base import CallReport, VoiceError, VoiceGateway
from app.services.voice.exotel import ExotelGateway

GATEWAYS: dict[str, VoiceGateway] = {gateway.key: gateway for gateway in (ExotelGateway(),)}

__all__ = ["GATEWAYS", "CallReport", "VoiceError", "VoiceGateway"]
