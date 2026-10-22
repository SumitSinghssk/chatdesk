from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class Menu(Base, TimestampMixin):

    __tablename__ = "menus"

    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)

    items = relationship("MenuItem", back_populates="menu", cascade="all, delete-orphan", order_by="MenuItem.sort_order")


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True)
    menu_id = Column(Integer, ForeignKey("menus.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=True, index=True)
    label = Column(String(120), nullable=False)
    url = Column(String(2000), nullable=False, default="#")
    sort_order = Column(Integer, nullable=False, default=0)
    new_tab = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    menu = relationship("Menu", back_populates="items")
