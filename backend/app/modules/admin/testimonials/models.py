from sqlalchemy import Boolean, Column, Integer, SmallInteger, String, Text

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class Testimonial(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "testimonials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    designation = Column(String(150), nullable=True)
    company = Column(String(150), nullable=True)
    quote = Column(Text, nullable=False)
    photo = Column(String(500), nullable=True)
    rating = Column(SmallInteger, nullable=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)
