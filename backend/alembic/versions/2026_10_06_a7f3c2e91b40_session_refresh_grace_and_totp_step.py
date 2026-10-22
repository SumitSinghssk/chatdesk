from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7f3c2e91b40'
down_revision: Union[str, Sequence[str], None] = 'cd233ad7c8ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_sessions', sa.Column('previous_refresh_hash', sa.String(length=64), nullable=True))
    op.add_column('user_sessions', sa.Column('rotated_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('two_factor_last_step', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'two_factor_last_step')
    op.drop_column('user_sessions', 'rotated_at')
    op.drop_column('user_sessions', 'previous_refresh_hash')
