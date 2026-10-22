from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.utils.datetime import now


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    __table_args__ = (Index("ix_activity_logs_subject", "subject_type", "subject_id"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    action = Column(String(50), nullable=False, index=True)
    subject_type = Column(String(50), nullable=True)
    subject_id = Column(Integer, nullable=True)
    subject_label = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(500), nullable=True)
    browser = Column(String(100), nullable=True)
    platform = Column(String(100), nullable=True)
    device = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)

    user = relationship("User")
