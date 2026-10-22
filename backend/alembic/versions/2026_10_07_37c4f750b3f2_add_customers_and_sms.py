from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '37c4f750b3f2'
down_revision: Union[str, Sequence[str], None] = '0d872a56dbca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('customers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('password', sa.String(length=255), nullable=True),
    sa.Column('google_id', sa.String(length=64), nullable=True),
    sa.Column('avatar', sa.String(length=500), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('signup_method', sa.String(length=20), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(), nullable=True),
    sa.Column('phone_verified_at', sa.DateTime(), nullable=True),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.Column('last_login_ip', sa.String(length=64), nullable=True),
    sa.Column('last_login_method', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customers_deleted_at'), 'customers', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_customers_id'), 'customers', ['id'], unique=False)
    op.create_index(op.f('ix_customers_status'), 'customers', ['status'], unique=False)
    op.create_index('uq_customers_email', 'customers', ['email'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('uq_customers_google_id', 'customers', ['google_id'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('uq_customers_phone', 'customers', ['phone'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('sms_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=False),
    sa.Column('template_key', sa.String(length=50), nullable=True),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('gateway', sa.String(length=30), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('message_id', sa.String(length=120), nullable=True),
    sa.Column('attempts', sa.JSON(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sms_logs_created_at'), 'sms_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_sms_logs_phone'), 'sms_logs', ['phone'], unique=False)
    op.create_index(op.f('ix_sms_logs_status'), 'sms_logs', ['status'], unique=False)
    op.create_index(op.f('ix_sms_logs_template_key'), 'sms_logs', ['template_key'], unique=False)
    op.create_table('customer_otps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=False),
    sa.Column('purpose', sa.String(length=20), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=True),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.SmallInteger(), nullable=False),
    sa.Column('gateway', sa.String(length=30), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('consumed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_otps_phone'), 'customer_otps', ['phone'], unique=False)
    op.create_table('customer_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('method', sa.String(length=20), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('last_active_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_customer_sessions_customer_id'), 'customer_sessions', ['customer_id'], unique=False)
    op.create_index(op.f('ix_customer_sessions_revoked_at'), 'customer_sessions', ['revoked_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_customer_sessions_revoked_at'), table_name='customer_sessions')
    op.drop_index(op.f('ix_customer_sessions_customer_id'), table_name='customer_sessions')
    op.drop_table('customer_sessions')
    op.drop_index(op.f('ix_customer_otps_phone'), table_name='customer_otps')
    op.drop_table('customer_otps')
    op.drop_index(op.f('ix_sms_logs_template_key'), table_name='sms_logs')
    op.drop_index(op.f('ix_sms_logs_status'), table_name='sms_logs')
    op.drop_index(op.f('ix_sms_logs_phone'), table_name='sms_logs')
    op.drop_index(op.f('ix_sms_logs_created_at'), table_name='sms_logs')
    op.drop_table('sms_logs')
    op.drop_index('uq_customers_phone', table_name='customers', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index('uq_customers_google_id', table_name='customers', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index('uq_customers_email', table_name='customers', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index(op.f('ix_customers_status'), table_name='customers')
    op.drop_index(op.f('ix_customers_id'), table_name='customers')
    op.drop_index(op.f('ix_customers_deleted_at'), table_name='customers')
    op.drop_table('customers')
