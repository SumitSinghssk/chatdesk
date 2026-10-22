from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '184e40ed710e'
down_revision: Union[str, Sequence[str], None] = 'c15987a3b0e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('payments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('gateway', sa.String(length=30), nullable=False),
    sa.Column('purpose', sa.String(length=50), nullable=False),
    sa.Column('reference', sa.String(length=64), nullable=True),
    sa.Column('customer_id', sa.Integer(), nullable=True),
    sa.Column('amount', sa.Integer(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('test_mode', sa.Boolean(), nullable=False),
    sa.Column('gateway_order_id', sa.String(length=100), nullable=True),
    sa.Column('gateway_payment_id', sa.String(length=100), nullable=True),
    sa.Column('method', sa.String(length=30), nullable=True),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.Column('payer', sa.JSON(), nullable=True),
    sa.Column('notes', sa.JSON(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('gateway_order_id')
    )
    op.create_index(op.f('ix_payments_created_at'), 'payments', ['created_at'], unique=False)
    op.create_index(op.f('ix_payments_customer_id'), 'payments', ['customer_id'], unique=False)
    op.create_index(op.f('ix_payments_gateway'), 'payments', ['gateway'], unique=False)
    op.create_index(op.f('ix_payments_gateway_payment_id'), 'payments', ['gateway_payment_id'], unique=False)
    op.create_index(op.f('ix_payments_purpose'), 'payments', ['purpose'], unique=False)
    op.create_index(op.f('ix_payments_reference'), 'payments', ['reference'], unique=False)
    op.create_index(op.f('ix_payments_status'), 'payments', ['status'], unique=False)
    op.create_table('payment_webhooks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('gateway', sa.String(length=30), nullable=False),
    sa.Column('event', sa.String(length=100), nullable=False),
    sa.Column('event_id', sa.String(length=100), nullable=True),
    sa.Column('payment_id', sa.Integer(), nullable=True),
    sa.Column('signature_valid', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('payload', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('gateway', 'event_id', name='uq_payment_webhooks_event')
    )
    op.create_index(op.f('ix_payment_webhooks_created_at'), 'payment_webhooks', ['created_at'], unique=False)
    op.create_index(op.f('ix_payment_webhooks_gateway'), 'payment_webhooks', ['gateway'], unique=False)
    op.create_index(op.f('ix_payment_webhooks_payment_id'), 'payment_webhooks', ['payment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_payment_webhooks_payment_id'), table_name='payment_webhooks')
    op.drop_index(op.f('ix_payment_webhooks_gateway'), table_name='payment_webhooks')
    op.drop_index(op.f('ix_payment_webhooks_created_at'), table_name='payment_webhooks')
    op.drop_table('payment_webhooks')
    op.drop_index(op.f('ix_payments_status'), table_name='payments')
    op.drop_index(op.f('ix_payments_reference'), table_name='payments')
    op.drop_index(op.f('ix_payments_purpose'), table_name='payments')
    op.drop_index(op.f('ix_payments_gateway_payment_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_gateway'), table_name='payments')
    op.drop_index(op.f('ix_payments_customer_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_created_at'), table_name='payments')
    op.drop_table('payments')
