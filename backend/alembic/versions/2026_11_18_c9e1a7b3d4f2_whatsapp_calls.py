"""whatsapp calls: calls answered in the browser, call permissions, calling settings

Revision ID: c9e1a7b3d4f2
Revises: b2d8f4a61c07
Create Date: 2026-11-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e1a7b3d4f2'
down_revision: Union[str, Sequence[str], None] = 'b2d8f4a61c07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """WhatsApp voice calls: incoming and outgoing calls answered in the browser, each customer's permission to
    be called, and each number's calling settings (synced to Meta)."""
    op.create_table(
        "wa_call_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("followup_on", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("followup_text", sa.Text(), nullable=True),
        sa.Column("permission_text", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("sync_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
    )
    op.create_table(
        "wa_calls",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("wacid", sa.String(length=128), nullable=False),
        sa.Column("direction", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("offer_sdp", sa.Text(), nullable=True),
        sa.Column("answer_sdp", sa.Text(), nullable=True),
        sa.Column("ringing_ids", sa.JSON(), nullable=False),
        sa.Column("declined_ids", sa.JSON(), nullable=False),
        sa.Column("claimed_by_id", sa.Integer(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("answered_by_id", sa.Integer(), nullable=True),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.Column("started_by_id", sa.Integer(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("ended_by", sa.String(length=12), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["wa_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["wa_contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["claimed_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["answered_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["started_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wacid"),
    )
    for column in ("id", "customer_id", "conversation_id", "status", "created_at"):
        op.create_index(op.f(f"ix_wa_calls_{column}"), "wa_calls", [column], unique=False)
    op.create_table(
        "wa_call_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("response_source", sa.String(length=20), nullable=True),
        sa.Column("unanswered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["wa_contacts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contact_id", name="uq_wa_call_permissions_contact"),
    )
    op.create_index(op.f("ix_wa_call_permissions_customer_id"), "wa_call_permissions", ["customer_id"],
                    unique=False)


def downgrade() -> None:
    op.drop_table("wa_call_permissions")
    op.drop_table("wa_calls")
    op.drop_table("wa_call_settings")
