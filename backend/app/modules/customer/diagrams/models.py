from sqlalchemy import (JSON, BigInteger, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class Diagram(Base, TimestampMixin):
    """A drawing (a flow, a plan, an org chart…) the team edits together, and can share by link."""

    __tablename__ = "diagrams"

    id = Column(Integer, primary_key=True, index=True)
    # the workspace's main account: diagrams belong to the team, not to one WhatsApp number
    workspace_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    folder = Column(String(60), nullable=True, index=True)
    # {"nodes": {id: {...}}, "edges": {id: {...}}}: every element is replaced whole when it changes
    content = Column(JSON, nullable=False, default=dict)
    seq = Column(Integer, nullable=False, default=0)  # the last change applied; clients catch up from here
    # what everyone else in the workspace may do: edit | comment | view | private (only people added)
    team_access = Column(String(10), nullable=False, default="edit")
    # a link for anyone, outside the workspace too: view or comment only
    share_token = Column(String(64), nullable=True, unique=True)
    link_enabled = Column(Boolean, nullable=False, default=False)
    link_access = Column(String(10), nullable=False, default="view")  # view | comment
    link_password = Column(String(255), nullable=True)  # a hash
    link_expires_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(String(150), nullable=True)
    updated_by = Column(String(150), nullable=True)
    last_version_at = Column(DateTime, nullable=True)  # the last automatic snapshot
    # a shared timer and dot voting for workshops: {"timer": {...} | None, "voting": {...}}
    session = Column(JSON, nullable=True)
    # approved: nobody changes it until someone who manages it unlocks it
    locked = Column(Boolean, nullable=False, default=False)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String(150), nullable=True)
    approved_version_id = Column(Integer, nullable=True)  # the copy kept when it was approved

    members = relationship("DiagramMember", cascade="all, delete-orphan", passive_deletes=True)


class DiagramMember(Base):
    """A team member given their own access to one diagram (more, or less, than the team's)."""

    __tablename__ = "diagram_members"
    __table_args__ = (UniqueConstraint("diagram_id", "member_id", name="uq_diagram_members"),)

    id = Column(Integer, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(10), nullable=False, default="edit")  # edit | comment | view


class DiagramOp(Base):
    """One saved batch of changes. Clients that were away replay these to catch up."""

    __tablename__ = "diagram_ops"
    __table_args__ = (Index("ix_diagram_ops_diagram_seq", "diagram_id", "seq"),)

    id = Column(BigInteger, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False)
    seq = Column(Integer, nullable=False)
    client_id = Column(String(40), nullable=True)  # the browser tab that made it (so it can skip its own echo)
    actor = Column(String(150), nullable=True)
    ops = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False)


class DiagramVersion(Base):
    """A saved copy of the whole diagram: automatic every so often, or saved by someone with a name."""

    __tablename__ = "diagram_versions"

    id = Column(Integer, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=True)
    content = Column(JSON, nullable=False)
    seq = Column(Integer, nullable=False, default=0)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False)


class DiagramComment(Base):
    """A comment pinned on the canvas (or on a shape). Replies point at the first comment."""

    __tablename__ = "diagram_comments"

    id = Column(Integer, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("diagram_comments.id", ondelete="CASCADE"), nullable=True, index=True)
    node_id = Column(String(64), nullable=True)
    x = Column(Float, nullable=True)
    y = Column(Float, nullable=True)
    body = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    author_name = Column(String(150), nullable=False)
    guest = Column(Boolean, nullable=False, default=False)  # someone who came through the share link
    mentions = Column(JSON, nullable=True)  # team members @mentioned: [{"id", "name"}]
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False)


class DiagramStar(Base):
    """A diagram someone starred, so it shows first for them."""

    __tablename__ = "diagram_stars"
    __table_args__ = (UniqueConstraint("diagram_id", "member_id", name="uq_diagram_stars"),)

    id = Column(Integer, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)


class DiagramActivity(Base):
    """Who opened, edited, commented or shared a diagram (edits are grouped, one line per person per hour)."""

    __tablename__ = "diagram_activity"
    __table_args__ = (Index("ix_diagram_activity_diagram_at", "diagram_id", "at"),)

    id = Column(Integer, primary_key=True)
    diagram_id = Column(Integer, ForeignKey("diagrams.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(20), nullable=False)  # created | edited | commented | shared | restored | viewed
    actor = Column(String(150), nullable=True)
    guest = Column(Boolean, nullable=False, default=False)
    detail = Column(String(255), nullable=True)
    at = Column(DateTime, nullable=False)
