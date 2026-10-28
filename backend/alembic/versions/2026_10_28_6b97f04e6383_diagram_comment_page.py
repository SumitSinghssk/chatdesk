"""diagram comment page

Revision ID: 6b97f04e6383
Revises: 69e76010e7b5
Create Date: 2026-10-28 10:20:03.199386

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b97f04e6383'
down_revision: Union[str, Sequence[str], None] = '69e76010e7b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A comment pinned on the canvas remembers which page it's on."""
    op.add_column("diagram_comments", sa.Column("page", sa.String(length=24), nullable=True))


def downgrade() -> None:
    op.drop_column("diagram_comments", "page")
