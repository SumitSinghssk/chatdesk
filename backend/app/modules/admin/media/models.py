from sqlalchemy import BigInteger, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class MediaFile(Base, TimestampMixin):

    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, index=True)
    folder = Column(String(100), nullable=False, default="general", index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    path = Column(String(500), nullable=False, unique=True)
    url = Column(String(500), nullable=False)
    mime = Column(String(100), nullable=True)
    extension = Column(String(10), nullable=True, index=True)
    size = Column(BigInteger, nullable=False, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    alt = Column(String(255), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    uploader = relationship("User")
