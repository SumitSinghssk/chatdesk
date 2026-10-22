from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class WaTemplate(Base, TimestampMixin):
    """A WhatsApp message template: a local draft, or a copy of one on Meta kept in sync.

    `components` is stored in Meta's own format, so templates made here and templates made in
    WhatsApp Manager look the same to the rest of the app.
    """

    __tablename__ = "wa_templates"
    __table_args__ = (UniqueConstraint("customer_id", "name", "language", name="uq_wa_templates_name_language"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    meta_id = Column(String(64), nullable=True, index=True)  # Meta's template id once submitted
    name = Column(String(512), nullable=False)
    language = Column(String(15), nullable=False)
    category = Column(String(20), nullable=False)  # marketing | utility | authentication
    parameter_format = Column(String(10), nullable=False, default="positional")  # positional | named
    # draft | pending | approved | rejected | paused | disabled | in_appeal | pending_deletion | archived ...
    status = Column(String(20), nullable=False, default="draft", index=True)
    rejected_reason = Column(String(255), nullable=True)
    quality = Column(String(10), nullable=True)  # GREEN | YELLOW | RED | UNKNOWN
    components = Column(JSON, nullable=False, default=list)
    source = Column(String(10), nullable=False, default="app")  # app | meta (made in WhatsApp Manager)
    # Header sample file (image/video/PDF) kept locally for the preview and for sending
    sample_key = Column(String(80), nullable=True)
    sample_mime = Column(String(100), nullable=True)
    sample_filename = Column(String(255), nullable=True)
    sample_size = Column(Integer, nullable=True)
    # WhatsApp media id of the sample, reused when sending (Meta keeps uploads for 30 days)
    media_id = Column(String(64), nullable=True)
    media_uploaded_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    status_changed_at = Column(DateTime, nullable=True)
    synced_at = Column(DateTime, nullable=True)

    customer = relationship("Customer")
