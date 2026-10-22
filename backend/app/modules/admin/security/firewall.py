from __future__ import annotations

import ipaddress
import logging
import threading
import time
from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.modules.admin.security.models import BlockedRequest, IpBlock
from app.shared.utils.datetime import now
from app.shared.constants import admin_urls as urls
from app.shared.constants.admin_urls import admin_url

logger = logging.getLogger(__name__)

CACHE_SECONDS = 30
REASON_BLOCKED = "blocked_ip"
REASON_RATE_LIMITED = "rate_limited"
REASONS = {
    REASON_BLOCKED: "Blocked IP",
    REASON_RATE_LIMITED: "Too many requests",
}

Network = ipaddress.IPv4Network | ipaddress.IPv6Network

_cache: dict = {"at": 0.0, "rules": []}
_lock = threading.Lock()


def parse_rule(rule: str) -> Network | None:
    try:
        return ipaddress.ip_network((rule or "").strip(), strict=False)
    except ValueError:
        return None


def valid_rule(rule: str) -> bool:
    rule = (rule or "").strip()
    address, _, mask = rule.partition("/")
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    if not mask:
        return True
    return mask.isdigit() and 1 <= int(mask) <= ip.max_prefixlen


def normalize_rule(rule: str) -> str:
    rule = rule.strip()
    if "/" not in rule:
        return str(ipaddress.ip_address(rule))
    return str(ipaddress.ip_network(rule, strict=False))


def matches(ip: str | None, rule: str | Network | None) -> bool:
    if not ip or rule is None:
        return False
    network = parse_rule(rule) if isinstance(rule, str) else rule
    if network is None:
        return False
    try:
        address = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False
    if address.version != network.version:
        mapped = getattr(address, "ipv4_mapped", None)
        return bool(mapped and mapped in network)
    return address in network


def is_loopback(rule: str) -> bool:
    network = parse_rule(rule)
    if network is None:
        return False
    loopback = ipaddress.ip_network("127.0.0.0/8" if network.version == 4 else "::1/128")
    return network.overlaps(loopback)


def flush() -> None:
    with _lock:
        _cache["at"] = 0.0
        _cache["rules"] = []


def active_query(db: Session):
    return db.query(IpBlock).filter(or_(IpBlock.expires_at.is_(None), IpBlock.expires_at > now()))


def _rules(db: Session | None = None) -> list[tuple]:
    if time.monotonic() - _cache["at"] < CACHE_SECONDS:
        return _cache["rules"]
    own = db is None
    session = db or SessionLocal()
    try:
        rows = active_query(session).with_entities(IpBlock.id, IpBlock.ip, IpBlock.expires_at).all()
    finally:
        if own:
            session.close()
    rules = []
    for block_id, rule, expires_at in rows:
        network = parse_rule(rule)
        if network is not None:
            rules.append((block_id, rule, network, expires_at.timestamp() if expires_at else None))
    with _lock:
        _cache["rules"] = rules
        _cache["at"] = time.monotonic()
    return rules


def active_rules(db: Session | None = None) -> list[str]:
    current = now().timestamp()
    return [rule for _, rule, _, exp in _rules(db) if exp is None or exp > current]


def block_for(ip: str | None, db: Session | None = None) -> int | None:
    if not ip:
        return None
    current = now().timestamp()
    for block_id, _, network, expires in _rules(db):
        if (expires is None or expires > current) and matches(ip, network):
            return block_id
    return None


def is_blocked(ip: str | None, db: Session | None = None) -> bool:
    try:
        return block_for(ip, db) is not None
    except Exception:
        logger.exception("Firewall lookup failed for %s", ip)
        return False


def block(db: Session, ip: str, reason: str | None, minutes: int | None, *,
          created_by: int | None = None, automatic: bool = False) -> IpBlock:
    row = IpBlock(
        ip=ip.strip(),
        reason=(reason or None) and reason[:255],
        automatic=automatic,
        expires_at=now() + timedelta(minutes=minutes) if minutes else None,
        created_by=created_by,
        hits=0,
    )
    db.add(row)
    db.flush()
    flush()
    return row


def unblock_ip(db: Session, ip: str) -> int:
    count = db.query(IpBlock).filter(IpBlock.ip == ip.strip()).delete(synchronize_session=False)
    db.commit()
    flush()
    return count


def record_blocked(ip: str | None, reason: str, request=None) -> None:
    if not ip:
        return
    db = SessionLocal()
    try:
        method = path = agent = None
        if request is not None:
            method = request.method[:10]
            path = request.url.path[:490]
            agent = (request.headers.get("user-agent") or "")[:490] or None
        db.add(BlockedRequest(ip=ip[:64], reason=reason[:30], method=method, path=path,
                              user_agent=agent, created_at=now()))
        if reason == REASON_BLOCKED:
            block_id = block_for(ip, db)
            if block_id:
                db.query(IpBlock).filter(IpBlock.id == block_id).update(
                    {IpBlock.hits: IpBlock.hits + 1, IpBlock.last_hit_at: now()}, synchronize_session=False
                )
        db.commit()
        if reason != REASON_BLOCKED:
            maybe_auto_block(db, ip)
    except Exception:
        db.rollback()
        logger.exception("Failed to record blocked request ip=%s reason=%s", ip, reason)
    finally:
        db.close()


def maybe_auto_block(db: Session, ip: str) -> IpBlock | None:
    from app.modules.admin.notifications.service import notify_admins
    from app.modules.admin.settings.service import get_group
    from app.shared.constants import permissions as P

    settings = get_group(db, "security")
    if not ip or not settings.get("auto_block") or is_loopback(ip) or block_for(ip, db):
        return None

    window = max(1, int(settings.get("auto_block_window") or 10))
    threshold = max(1, int(settings.get("auto_block_after") or 30))
    recent = (
        db.query(BlockedRequest.id)
        .filter(BlockedRequest.ip == ip, BlockedRequest.reason != REASON_BLOCKED,
                BlockedRequest.created_at >= now() - timedelta(minutes=window))
        .count()
    )
    if recent < threshold:
        return None

    minutes = max(1, int(settings.get("auto_block_minutes") or 60))
    row = block(db, ip, f"{recent} blocked requests in {window} minutes", minutes, automatic=True)
    notify_admins(db, permission=P.SETTINGS_VIEW, type="security.auto_block",
                  title="IP blocked automatically",
                  message=f"{ip} was blocked for {minutes} minutes after {recent} blocked requests.",
                  url=admin_url(urls.SETTINGS, tab="security"), data={"ip": ip})
    db.commit()
    flush()
    return row


def purge(db: Session) -> tuple[int, int]:
    from app.modules.admin.settings.service import get_group

    days = max(1, int(get_group(db, "security").get("log_days") or 30))
    removed = (
        db.query(BlockedRequest)
        .filter(BlockedRequest.created_at < now() - timedelta(days=days))
        .delete(synchronize_session=False)
    )
    expired = (
        db.query(IpBlock)
        .filter(IpBlock.expires_at.isnot(None), IpBlock.expires_at < now() - timedelta(days=1))
        .delete(synchronize_session=False)
    )
    db.commit()
    if expired:
        flush()
    return removed, expired
