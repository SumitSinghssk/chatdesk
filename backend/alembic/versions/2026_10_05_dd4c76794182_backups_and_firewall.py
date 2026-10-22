from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'dd4c76794182'
down_revision: Union[str, Sequence[str], None] = '7bbdca1338f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('blocked_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=False),
    sa.Column('reason', sa.String(length=30), nullable=False),
    sa.Column('method', sa.String(length=10), nullable=True),
    sa.Column('path', sa.String(length=500), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blocked_requests_created_at'), 'blocked_requests', ['created_at'], unique=False)
    op.create_index(op.f('ix_blocked_requests_ip'), 'blocked_requests', ['ip'], unique=False)
    op.create_table('backups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('trigger', sa.String(length=20), nullable=False),
    sa.Column('includes_database', sa.Boolean(), nullable=False),
    sa.Column('includes_files', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('stage', sa.String(length=50), nullable=True),
    sa.Column('parts', sa.JSON(), nullable=True),
    sa.Column('size', sa.BigInteger(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('finished_at', sa.DateTime(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_backups_id'), 'backups', ['id'], unique=False)
    op.create_index(op.f('ix_backups_status'), 'backups', ['status'], unique=False)
    op.create_table('ip_blocks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=False),
    sa.Column('reason', sa.String(length=255), nullable=True),
    sa.Column('automatic', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('hits', sa.Integer(), nullable=False),
    sa.Column('last_hit_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ip_blocks_expires_at'), 'ip_blocks', ['expires_at'], unique=False)
    op.create_index(op.f('ix_ip_blocks_id'), 'ip_blocks', ['id'], unique=False)
    op.create_index(op.f('ix_ip_blocks_ip'), 'ip_blocks', ['ip'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ip_blocks_ip'), table_name='ip_blocks')
    op.drop_index(op.f('ix_ip_blocks_id'), table_name='ip_blocks')
    op.drop_index(op.f('ix_ip_blocks_expires_at'), table_name='ip_blocks')
    op.drop_table('ip_blocks')
    op.drop_index(op.f('ix_backups_status'), table_name='backups')
    op.drop_index(op.f('ix_backups_id'), table_name='backups')
    op.drop_table('backups')
    op.drop_index(op.f('ix_blocked_requests_ip'), table_name='blocked_requests')
    op.drop_index(op.f('ix_blocked_requests_created_at'), table_name='blocked_requests')
    op.drop_table('blocked_requests')
