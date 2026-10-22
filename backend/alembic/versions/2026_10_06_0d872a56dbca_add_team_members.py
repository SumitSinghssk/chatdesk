from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0d872a56dbca'
down_revision: Union[str, Sequence[str], None] = '5a74b5df1d1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('team_members',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('designation', sa.String(length=150), nullable=True),
    sa.Column('department', sa.String(length=150), nullable=True),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('photo', sa.String(length=500), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('social_links', sa.JSON(), nullable=True),
    sa.Column('is_featured', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_team_members_deleted_at'), 'team_members', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_team_members_department'), 'team_members', ['department'], unique=False)
    op.create_index(op.f('ix_team_members_id'), 'team_members', ['id'], unique=False)
    op.create_index(op.f('ix_team_members_status'), 'team_members', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_team_members_status'), table_name='team_members')
    op.drop_index(op.f('ix_team_members_id'), table_name='team_members')
    op.drop_index(op.f('ix_team_members_department'), table_name='team_members')
    op.drop_index(op.f('ix_team_members_deleted_at'), table_name='team_members')
    op.drop_table('team_members')
