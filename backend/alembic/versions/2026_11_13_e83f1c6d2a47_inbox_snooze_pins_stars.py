"""inbox: snooze, pinned chats, starred messages

Revision ID: e83f1c6d2a47
Revises: d71e0b3a9c55
Create Date: 2026-11-13 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e83f1c6d2a47'
down_revision: Union[str, Sequence[str], None] = 'd71e0b3a9c55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Snooze a chat until a time; pin chats for yourself or everyone; star messages for the team."""
    op.add_column("wa_conversations", sa.Column("snoozed_until", sa.DateTime(), nullable=True))
    op.add_column("wa_conversations", sa.Column("snooze_note", sa.String(length=200), nullable=True))
    op.add_column("wa_conversations", sa.Column("snoozed_by_id", sa.Integer(), nullable=True))
    op.add_column("wa_conversations", sa.Column("snooze_keep", sa.Boolean(), nullable=False,
                                                server_default=sa.text("false")))
    op.add_column("wa_conversations", sa.Column("snooze_woke_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_wa_conversations_snoozed_until"), "wa_conversations", ["snoozed_until"], unique=False)
    op.create_foreign_key("fk_wa_conversations_snoozed_by_id", "wa_conversations", "customers",
                          ["snoozed_by_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "wa_conversation_pins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["wa_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wa_conversation_pins_customer_id"), "wa_conversation_pins", ["customer_id"],
                    unique=False)
    op.create_index("uq_wa_conversation_pins_member", "wa_conversation_pins", ["conversation_id", "member_id"],
                    unique=True, postgresql_where=sa.text("member_id IS NOT NULL"))
    op.create_index("uq_wa_conversation_pins_everyone", "wa_conversation_pins", ["conversation_id"],
                    unique=True, postgresql_where=sa.text("member_id IS NULL"))

    op.create_table(
        "wa_message_stars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["wa_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["wa_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id"),
    )
    op.create_index(op.f("ix_wa_message_stars_id"), "wa_message_stars", ["id"], unique=False)
    op.create_index(op.f("ix_wa_message_stars_customer_id"), "wa_message_stars", ["customer_id"], unique=False)
    op.create_index(op.f("ix_wa_message_stars_conversation_id"), "wa_message_stars", ["conversation_id"],
                    unique=False)
    op.create_index(op.f("ix_wa_message_stars_member_id"), "wa_message_stars", ["member_id"], unique=False)


def downgrade() -> None:
    op.drop_table("wa_message_stars")
    op.drop_table("wa_conversation_pins")
    op.drop_constraint("fk_wa_conversations_snoozed_by_id", "wa_conversations", type_="foreignkey")
    op.drop_index(op.f("ix_wa_conversations_snoozed_until"), table_name="wa_conversations")
    for column in ("snooze_woke_at", "snooze_keep", "snoozed_by_id", "snooze_note", "snoozed_until"):
        op.drop_column("wa_conversations", column)
