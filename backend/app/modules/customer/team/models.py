from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.utils.datetime import now


class WaTeam(Base):
    """A group of members, e.g. Sales or Support. Chats can be assigned to a team."""

    __tablename__ = "wa_teams"
    __table_args__ = (UniqueConstraint("customer_id", "name", name="uq_wa_teams_name"),)

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=now)

    members = relationship("WaTeamMember", back_populates="team", cascade="all, delete-orphan",
                           passive_deletes=True)


class WaTeamMember(Base):
    __tablename__ = "wa_team_members"
    __table_args__ = (UniqueConstraint("team_id", "member_id", name="uq_wa_team_members"),)

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("wa_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)

    team = relationship("WaTeam", back_populates="members")
