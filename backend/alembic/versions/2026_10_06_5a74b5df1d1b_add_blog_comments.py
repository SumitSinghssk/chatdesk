from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5a74b5df1d1b'
down_revision: Union[str, Sequence[str], None] = 'a7f3c2e91b40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('blog_comments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('blog_id', sa.Integer(), nullable=False),
    sa.Column('parent_id', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('author_name', sa.String(length=120), nullable=False),
    sa.Column('author_email', sa.String(length=255), nullable=True),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('is_admin', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['blog_id'], ['blogs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_id'], ['blog_comments.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blog_comments_author_email'), 'blog_comments', ['author_email'], unique=False)
    op.create_index(op.f('ix_blog_comments_blog_id'), 'blog_comments', ['blog_id'], unique=False)
    op.create_index('ix_blog_comments_blog_status', 'blog_comments', ['blog_id', 'status'], unique=False)
    op.create_index(op.f('ix_blog_comments_id'), 'blog_comments', ['id'], unique=False)
    op.create_index(op.f('ix_blog_comments_parent_id'), 'blog_comments', ['parent_id'], unique=False)
    op.create_index(op.f('ix_blog_comments_status'), 'blog_comments', ['status'], unique=False)
    op.create_index(op.f('ix_blog_comments_user_id'), 'blog_comments', ['user_id'], unique=False)
    op.add_column('blogs', sa.Column('comments_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    op.drop_column('blogs', 'comments_enabled')
    op.drop_index(op.f('ix_blog_comments_user_id'), table_name='blog_comments')
    op.drop_index(op.f('ix_blog_comments_status'), table_name='blog_comments')
    op.drop_index(op.f('ix_blog_comments_parent_id'), table_name='blog_comments')
    op.drop_index(op.f('ix_blog_comments_id'), table_name='blog_comments')
    op.drop_index('ix_blog_comments_blog_status', table_name='blog_comments')
    op.drop_index(op.f('ix_blog_comments_blog_id'), table_name='blog_comments')
    op.drop_index(op.f('ix_blog_comments_author_email'), table_name='blog_comments')
    op.drop_table('blog_comments')
