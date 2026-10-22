from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class IpBlock(Base, TimestampMixin):

    __tablename__ = "ip_blocks"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String(64), nullable=False, index=True)
    reason = Column(String(255), nullable=True)
    automatic = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    hits = Column(Integer, nullable=False, default=0)
    last_hit_at = Column(DateTime, nullable=True)


class BlockedRequest(Base):

    __tablename__ = "blocked_requests"

    id = Column(Integer, primary_key=True)
    ip = Column(String(64), nullable=False, index=True)
    reason = Column(String(30), nullable=False)
    method = Column(String(10), nullable=True)
    path = Column(String(500), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)


class RateLimitHit(Base):

    __tablename__ = "rate_limit_hits"

    key = Column(String(600), primary_key=True)
    window_start = Column(BigInteger, primary_key=True)
    count = Column(Integer, nullable=False, default=0)
    expires_at = Column(BigInteger, nullable=False, index=True)
