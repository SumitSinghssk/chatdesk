from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'cd233ad7c8ed'
down_revision: Union[str, Sequence[str], None] = 'dd4c76794182'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('rate_limit_hits',
    sa.Column('key', sa.String(length=600), nullable=False),
    sa.Column('window_start', sa.BigInteger(), nullable=False),
    sa.Column('count', sa.Integer(), nullable=False),
    sa.Column('expires_at', sa.BigInteger(), nullable=False),
    sa.PrimaryKeyConstraint('key', 'window_start')
    )
    op.create_index(op.f('ix_rate_limit_hits_expires_at'), 'rate_limit_hits', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_rate_limit_hits_expires_at'), table_name='rate_limit_hits')
    op.drop_table('rate_limit_hits')
