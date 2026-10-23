from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, SmallInteger, String, text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import SoftDeleteMixin, TimestampMixin
from app.shared.utils.datetime import now


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"
    __table_args__ = (
        Index("uq_customers_email", "email", unique=True, postgresql_where=text("deleted_at IS NULL")),
        Index("uq_customers_phone", "phone", unique=True, postgresql_where=text("deleted_at IS NULL")),
        Index("uq_customers_google_id", "google_id", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    password = Column(String(255), nullable=True)
    google_id = Column(String(64), nullable=True)
    avatar = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)
    signup_method = Column(String(20), nullable=False, default="password")
    business_name = Column(String(150), nullable=True)
    email_verified_at = Column(DateTime, nullable=True)
    phone_verified_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    last_login_ip = Column(String(64), nullable=True)
    last_login_method = Column(String(20), nullable=True)
    # Team: a member belongs to the owner's workspace (workspace_id = owner's id; NULL = an owner)
    workspace_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    role = Column(String(10), nullable=False, default="owner", server_default="owner")  # owner | admin | agent
    availability = Column(String(10), nullable=False, default="available", server_default="available")
    last_assigned_at = Column(DateTime, nullable=True)  # round-robin order
    invite_token_hash = Column(String(64), nullable=True, index=True)
    invite_expires_at = Column(DateTime, nullable=True)
    invited_by = Column(String(150), nullable=True)
    team_settings = Column(JSON, nullable=True)  # owners only: assignment rules and agent visibility
    automation_settings = Column(JSON, nullable=True)  # owners only: office hours and opt-out keywords

    sessions = relationship("CustomerSession", back_populates="customer", cascade="all, delete-orphan",
                            passive_deletes=True)
    workspace = relationship("Customer", remote_side=[id], foreign_keys=[workspace_id])


class CustomerSession(Base):
    __tablename__ = "customer_sessions"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    method = Column(String(20), nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=now, nullable=False)
    last_active_at = Column(DateTime, default=now, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True, index=True)

    customer = relationship("Customer", back_populates="sessions")


class CustomerOtp(Base):
    __tablename__ = "customer_otps"

    id = Column(Integer, primary_key=True)
    phone = Column(String(20), nullable=False, index=True)
    purpose = Column(String(20), nullable=False, default="login")
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True)
    code_hash = Column(String(64), nullable=False)
    attempts = Column(SmallInteger, nullable=False, default=0)
    gateway = Column(String(30), nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=now, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
