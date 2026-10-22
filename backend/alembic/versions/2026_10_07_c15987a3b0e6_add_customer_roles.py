from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c15987a3b0e6'
down_revision: Union[str, Sequence[str], None] = '37c4f750b3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('roles', postgresql.ARRAY(sa.String(length=20)), server_default='{}', nullable=False))
    op.add_column('customers', sa.Column('active_role', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'active_role')
    op.drop_column('customers', 'roles')
