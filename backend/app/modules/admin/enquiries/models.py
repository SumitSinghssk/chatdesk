from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import EnquiryStatus
from app.shared.mixins import SoftDeleteMixin, TimestampMixin
from app.shared.utils.datetime import now


class Enquiry(Base, TimestampMixin, SoftDeleteMixin):

    __tablename__ = "enquiries"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50), nullable=False, default="website", index=True)
    source_url = Column(String(1000), nullable=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(30), nullable=True)
    company = Column(String(150), nullable=True)
    subject = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default=EnquiryStatus.NEW.value, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    follow_up_at = Column(DateTime, nullable=True, index=True)
    seen_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])
    activities = relationship(
        "EnquiryActivity",
        back_populates="enquiry",
        cascade="all, delete-orphan",
        order_by="EnquiryActivity.created_at.desc()",
    )

    @property
    def reference(self) -> str:
        return f"ENQ-{self.id:05d}"


class EnquiryActivity(Base):

    __tablename__ = "enquiry_activities"

    id = Column(Integer, primary_key=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(20), nullable=False)
    body = Column(Text, nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=now, nullable=False)

    enquiry = relationship("Enquiry", back_populates="activities")
    user = relationship("User")
