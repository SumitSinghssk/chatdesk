from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base
from app.shared.utils.datetime import now


class Notification(Base):

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    url = Column(String(500), nullable=True)
    data = Column(JSON, nullable=True)
    read_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=now, nullable=False, index=True)
