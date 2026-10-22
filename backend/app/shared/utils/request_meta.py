import ipaddress
from functools import lru_cache

from fastapi import Request
from user_agents import parse as parse_ua

from app.core.config import settings


@lru_cache(maxsize=1)
def _trusted_networks() -> tuple:
    networks = []
    for entry in settings.TRUSTED_PROXIES:
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def _parse_ip(value: str | None):
    if not value:
        return None
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted(ip) -> bool:
    return any(ip.version == net.version and ip in net for net in _trusted_networks())


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    host = request.client.host if request.client else None
    peer = _parse_ip(host)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and peer is not None and _is_trusted(peer):
        for part in reversed(forwarded.split(",")):
            ip = _parse_ip(part)
            if ip is None:
                continue
            if not _is_trusted(ip):
                return str(ip)[:64]
    return host[:64] if host else None


def user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    return ua[:500] if ua else None


def describe_agent(ua: str | None) -> dict:
    if not ua:
        return {"browser": None, "platform": None, "device": None}
    parsed = parse_ua(ua)
    device = "mobile" if parsed.is_mobile else "tablet" if parsed.is_tablet else "bot" if parsed.is_bot else "desktop"
    browser = f"{parsed.browser.family} {parsed.browser.version_string}".strip()
    platform = f"{parsed.os.family} {parsed.os.version_string}".strip()
    return {"browser": browser or None, "platform": platform or None, "device": device}
