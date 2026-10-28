"""diagram comment tasks

Revision ID: 0b0311ff3c1e
Revises: b3301fd4e736
Create Date: 2026-10-28 09:58:14.067839

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b0311ff3c1e'
down_revision: Union[str, Sequence[str], None] = 'b3301fd4e736'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Comments can be tasks: who does it, and when by."""
    op.add_column("diagram_comments", sa.Column("assignee_id", sa.Integer(), nullable=True))
    op.add_column("diagram_comments", sa.Column("assignee_name", sa.String(length=150), nullable=True))
    op.add_column("diagram_comments", sa.Column("due_on", sa.Date(), nullable=True))
    op.add_column("diagram_comments", sa.Column("assigned_by", sa.String(length=150), nullable=True))
    op.create_foreign_key("fk_diagram_comments_assignee_id", "diagram_comments", "customers", ["assignee_id"],
                          ["id"], ondelete="SET NULL")
    op.create_index("ix_diagram_comments_assignee_id", "diagram_comments", ["assignee_id"])


def downgrade() -> None:
    op.drop_index("ix_diagram_comments_assignee_id", table_name="diagram_comments")
    op.drop_constraint("fk_diagram_comments_assignee_id", "diagram_comments", type_="foreignkey")
    for column in ("assigned_by", "due_on", "assignee_name", "assignee_id"):
        op.drop_column("diagram_comments", column)
