"""growth: feedback (CSAT), journeys, WhatsApp spend meter

Revision ID: d4f6b8e2a913
Revises: c9e1a7b3d4f2
Create Date: 2026-11-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f6b8e2a913'
down_revision: Union[str, Sequence[str], None] = 'c9e1a7b3d4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _stamps():
    return [sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False)]


def upgrade() -> None:
    """Ask customers for a 1-5 rating, send lifecycle messages (after an order, reorder, birthday), and estimate
    what WhatsApp messages cost from Meta's pricing category on each billed message."""
    op.add_column("wa_messages", sa.Column("billable_category", sa.String(length=20), nullable=True))

    op.create_table(
        "wa_feedback_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("on_resolve", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("on_delivered", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("thanks_text", sa.Text(), nullable=True),
        sa.Column("sorry_text", sa.Text(), nullable=True),
        sa.Column("review_url", sa.String(length=500), nullable=True),
        sa.Column("gap_days", sa.SmallInteger(), nullable=False, server_default="7"),
        *_stamps(),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
    )
    op.create_table(
        "wa_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("score", sa.SmallInteger(), nullable=True),
        sa.Column("asked_at", sa.DateTime(), nullable=False),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["wa_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["wa_contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["commerce_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["wa_messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wa_feedback_id"), "wa_feedback", ["id"], unique=False)
    op.create_index(op.f("ix_wa_feedback_conversation_id"), "wa_feedback", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_wa_feedback_contact_id"), "wa_feedback", ["contact_id"], unique=False)
    op.create_index("ix_wa_feedback_customer_asked", "wa_feedback", ["customer_id", "asked_at"], unique=False)

    op.create_table(
        "wa_journeys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("delay_days", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("send_hour", sa.SmallInteger(), nullable=False, server_default="10"),
        *_stamps(),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["wa_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "kind", name="uq_wa_journeys_kind"),
    )
    op.create_index(op.f("ix_wa_journeys_customer_id"), "wa_journeys", ["customer_id"], unique=False)
    op.create_table(
        "wa_journey_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("journey_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["journey_id"], ["wa_journeys.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["wa_contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["wa_messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("journey_id", "key", name="uq_wa_journey_runs_key"),
    )
    op.create_index(op.f("ix_wa_journey_runs_journey_id"), "wa_journey_runs", ["journey_id"], unique=False)
    op.create_index(op.f("ix_wa_journey_runs_created_at"), "wa_journey_runs", ["created_at"], unique=False)

    op.create_table(
        "wa_spend_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("rates", sa.JSON(), nullable=False),
        sa.Column("monthly_budget", sa.Float(), nullable=True),
        *_stamps(),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
    )


def downgrade() -> None:
    op.drop_table("wa_spend_settings")
    op.drop_table("wa_journey_runs")
    op.drop_table("wa_journeys")
    op.drop_table("wa_feedback")
    op.drop_table("wa_feedback_settings")
    op.drop_column("wa_messages", "billable_category")
