"""Add encrypted merchant wallet private key field.

Revision ID: 003_wallet_encrypted_key
Revises: 002_agent_wallet_fields
Create Date: 2026-05-01 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '003_wallet_encrypted_key'
down_revision: Union[str, None] = '002_agent_wallet_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shops',
        sa.Column('wallet_encrypted_key', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('shops', 'wallet_encrypted_key')
