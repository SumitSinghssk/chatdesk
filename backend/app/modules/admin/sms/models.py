from sqlalchemy import JSON, Column, DateTime, Integer, String, Text

from app.core.database import Base
from app.shared.utils.datetime import now


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id = Column(Integer, primary_key=True)
    phone = Column(String(20), nullable=False, index=True)
    template_key = Column(String(50), nullable=True, index=True)
    message = Column(Text, nullable=True)
    gateway = Column(String(30), nullable=True)
    status = Column(String(20), nullable=False, index=True)
    message_id = Column(String(120), nullable=True)
    attempts = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)
