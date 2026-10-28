"""diagram pages and embeds

Revision ID: 69e76010e7b5
Revises: 0b0311ff3c1e
Create Date: 2026-10-28 10:09:05.561011

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '69e76010e7b5'
down_revision: Union[str, Sequence[str], None] = '0b0311ff3c1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Diagrams can have pages, and be shown on another website."""
    op.add_column("diagrams", sa.Column("pages", sa.JSON(), nullable=True))
    op.add_column("diagrams", sa.Column("embed_token", sa.String(length=64), nullable=True))
    op.add_column("diagrams", sa.Column("embed_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_unique_constraint("uq_diagrams_embed_token", "diagrams", ["embed_token"])


def downgrade() -> None:
    op.drop_constraint("uq_diagrams_embed_token", "diagrams", type_="unique")
    for column in ("embed_enabled", "embed_token", "pages"):
        op.drop_column("diagrams", column)
