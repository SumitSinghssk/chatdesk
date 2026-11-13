"""inbox: word search over messages and notes, saved views

Revision ID: f19a7d4e5b60
Revises: e83f1c6d2a47
Create Date: 2026-11-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f19a7d4e5b60'
down_revision: Union[str, Sequence[str], None] = 'e83f1c6d2a47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Must match inbox/search.py MESSAGE_DOC / NOTE_DOC exactly, or Postgres won't use the indexes.
MESSAGE_DOC = "to_tsvector('simple', coalesce(text, '') || ' ' || coalesce(media_filename, ''))"
NOTE_DOC = "to_tsvector('simple', coalesce(body, ''))"


def upgrade() -> None:
    """Search finds words in any message, file name or internal note (fast, via GIN indexes), and a search
    plus filters can be saved as a view, for oneself or the team."""
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_wa_messages_fts ON wa_messages USING gin ({MESSAGE_DOC})")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_wa_notes_fts ON wa_notes USING gin ({NOTE_DOC})")
    op.create_table(
        "wa_inbox_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wa_inbox_views_customer_member", "wa_inbox_views", ["customer_id", "member_id"])


def downgrade() -> None:
    op.drop_table("wa_inbox_views")
    op.execute("DROP INDEX IF EXISTS ix_wa_notes_fts")
    op.execute("DROP INDEX IF EXISTS ix_wa_messages_fts")
