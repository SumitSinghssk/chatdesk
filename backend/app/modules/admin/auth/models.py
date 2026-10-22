from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.utils.datetime import now


class UserSession(Base):

    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(64), nullable=True)
    previous_refresh_hash = Column(String(64), nullable=True)
    rotated_at = Column(DateTime, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(500), nullable=True)
    remember = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=now, nullable=False)
    last_active_at = Column(DateTime, default=now, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True, index=True)

    user = relationship("User", back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime, default=now, nullable=False)
