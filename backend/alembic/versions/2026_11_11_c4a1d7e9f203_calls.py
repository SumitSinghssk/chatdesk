"""calls: the business's calling provider and the call log

Revision ID: c4a1d7e9f203
Revises: 6b97f04e6383
Create Date: 2026-11-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a1d7e9f203'
down_revision: Union[str, Sequence[str], None] = '6b97f04e6383'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Calls: each number connects its own Exotel account and picks the WhatsApp message sent after an
    answered or a missed call; every call is logged with its recording."""
    op.create_table(
        "call_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("webhook_key", sa.String(length=64), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_event_at", sa.DateTime(), nullable=True),
        sa.Column("answered", sa.JSON(), nullable=False),
        sa.Column("missed", sa.JSON(), nullable=False),
        sa.Column("min_answered_seconds", sa.Integer(), nullable=False),
        sa.Column("record_calls", sa.Boolean(), nullable=False),
        sa.Column("save_recordings", sa.Boolean(), nullable=False),
        sa.Column("agent_number", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
    )
    op.create_index(op.f("ix_call_settings_id"), "call_settings", ["id"], unique=False)
    op.create_index(op.f("ix_call_settings_webhook_key"), "call_settings", ["webhook_key"], unique=True)

    op.create_table(
        "call_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("call_sid", sa.String(length=100), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("from_number", sa.String(length=32), nullable=True),
        sa.Column("to_number", sa.String(length=32), nullable=True),
        sa.Column("customer_number", sa.String(length=32), nullable=True),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("started_by_id", sa.Integer(), nullable=True),
        sa.Column("provider_status", sa.String(length=30), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("follow_up", sa.String(length=20), nullable=True),
        sa.Column("follow_up_note", sa.Text(), nullable=True),
        sa.Column("follow_up_message_id", sa.Integer(), nullable=True),
        sa.Column("recording_url", sa.Text(), nullable=True),
        sa.Column("recording_status", sa.String(length=20), nullable=False),
        sa.Column("recording_file", sa.String(length=255), nullable=True),
        sa.Column("recording_size", sa.Integer(), nullable=True),
        sa.Column("recording_attempts", sa.Integer(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["wa_contacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["started_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["follow_up_message_id"], ["wa_messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "call_sid", name="uq_call_logs_customer_sid"),
    )
    op.create_index(op.f("ix_call_logs_id"), "call_logs", ["id"], unique=False)
    op.create_index(op.f("ix_call_logs_customer_id"), "call_logs", ["customer_id"], unique=False)
    op.create_index(op.f("ix_call_logs_customer_number"), "call_logs", ["customer_number"], unique=False)
    op.create_index(op.f("ix_call_logs_contact_id"), "call_logs", ["contact_id"], unique=False)
    op.create_index(op.f("ix_call_logs_outcome"), "call_logs", ["outcome"], unique=False)
    op.create_index(op.f("ix_call_logs_ended_at"), "call_logs", ["ended_at"], unique=False)


def downgrade() -> None:
    op.drop_table("call_logs")
    op.drop_table("call_settings")
