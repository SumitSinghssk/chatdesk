"""web push subscriptions

Revision ID: b2d8f4a61c07
Revises: a5c2e9f13d84
Create Date: 2026-11-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d8f4a61c07'
down_revision: Union[str, Sequence[str], None] = 'a5c2e9f13d84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Browsers and phones that allowed push notifications, so alerts reach people with ChatDesk closed."""
    op.create_table(
        "customer_push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("failures", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index(op.f("ix_customer_push_subscriptions_customer_id"), "customer_push_subscriptions",
                    ["customer_id"], unique=False)


def downgrade() -> None:
    op.drop_table("customer_push_subscriptions")
