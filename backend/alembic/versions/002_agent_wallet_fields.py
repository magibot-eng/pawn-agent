"""Add managed agent wallet fields to shops.

Revision ID: 002_agent_wallet_fields
Revises: 001_initial
Create Date: 2026-04-30 15:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002_agent_wallet_fields'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'


def upgrade() -> None:
    op.add_column(
        'shops',
        sa.Column('wallet_provider', sa.String(length=32), nullable=False, server_default='cdp_agentic_wallet'),
    )
    op.add_column(
        'shops',
        sa.Column('wallet_provider_account_id', sa.String(length=128), nullable=True),
    )
    op.add_column(
        'shops',
        sa.Column('wallet_status', sa.String(length=16), nullable=False, server_default='pending'),
    )
    op.add_column(
        'shops',
        sa.Column('auto_settlement_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Existing rows that used the owner wallet as merchant wallet are left intact for now.
    # New application logic stops assigning owner wallets to merchant_address automatically.


def downgrade() -> None:
    op.drop_column('shops', 'auto_settlement_enabled')
    op.drop_column('shops', 'wallet_status')
    op.drop_column('shops', 'wallet_provider_account_id')
    op.drop_column('shops', 'wallet_provider')
