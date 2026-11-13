"""inbox: presence, note authors and edits

Revision ID: d71e0b3a9c55
Revises: c4a1d7e9f203
Create Date: 2026-11-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd71e0b3a9c55'
down_revision: Union[str, Sequence[str], None] = 'c4a1d7e9f203'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Who is in a chat right now (so two people don't answer the same customer), and notes that remember who
    wrote them (they and admins can edit or delete them) and when they were last edited."""
    op.create_table(
        "wa_presence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=10), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["wa_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "member_id", name="uq_wa_presence_conversation_member"),
    )
    op.create_index(op.f("ix_wa_presence_customer_id"), "wa_presence", ["customer_id"], unique=False)
    op.create_index(op.f("ix_wa_presence_conversation_id"), "wa_presence", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_wa_presence_updated_at"), "wa_presence", ["updated_at"], unique=False)

    op.add_column("wa_notes", sa.Column("member_id", sa.Integer(), nullable=True))
    op.add_column("wa_notes", sa.Column("edited_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_wa_notes_member_id", "wa_notes", "customers", ["member_id"], ["id"],
                          ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_wa_notes_member_id", "wa_notes", type_="foreignkey")
    op.drop_column("wa_notes", "edited_at")
    op.drop_column("wa_notes", "member_id")
    op.drop_table("wa_presence")
