"""Initial migration — create all pawn agent tables.

Revision ID: 001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # shops
    op.create_table(
        'shops',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('owner_address', sa.String(42), nullable=False),
        sa.Column('ens_name', sa.String(256), nullable=False),
        sa.Column('display_name', sa.String(256), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='draft'),
        sa.Column('contract_address', sa.String(42), nullable=True),
        sa.Column('payout_token', sa.String(42), nullable=False,
                  server_default='0x0000000000000000000000000000000000000000'),
        sa.Column('merchant_address', sa.String(42), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_shops_owner_address', 'shops', ['owner_address'])
    op.create_index('ix_shops_ens_name', 'shops', ['ens_name'])
    op.create_index('ix_shops_status', 'shops', ['status'])

    # shop_ens_identities
    op.create_table(
        'shop_ens_identities',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('shop_id', sa.String(64), sa.ForeignKey('shops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ens_name', sa.String(256), nullable=False),
        sa.Column('ens_type', sa.String(32), nullable=False, server_default='subdomain'),
        sa.Column('is_primary', sa.Boolean, server_default='0', nullable=False),
        sa.Column('resolver_address', sa.String(42), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_shop_ens_identities_shop_id', 'shop_ens_identities', ['shop_id'])
    op.create_index('ix_shop_ens_identities_ens_name', 'shop_ens_identities', ['ens_name'])

    # provider_keys
    op.create_table(
        'provider_keys',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('shop_id', sa.String(64), sa.ForeignKey('shops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(32), nullable=False),
        sa.Column('encrypted_key', sa.Text, nullable=False),
        sa.Column('model', sa.String(64), nullable=True),
        sa.Column('label', sa.String(64), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean, server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_provider_keys_shop_id', 'provider_keys', ['shop_id'])
    op.create_index('ix_provider_keys_provider', 'provider_keys', ['provider'])

    # negotiation_sessions
    op.create_table(
        'negotiation_sessions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('shop_id', sa.String(64), sa.ForeignKey('shops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('seller_address', sa.String(42), nullable=False),
        sa.Column('input_token', sa.String(42), nullable=False),
        sa.Column('input_amount', sa.String(78), nullable=False),
        sa.Column('settled', sa.Boolean, server_default='0', nullable=False),
        sa.Column('chat_log', sa.Text, server_default='[]', nullable=False),
        sa.Column('outcome', sa.String(32), nullable=True),
        sa.Column('negotiation_state', sa.JSON(), nullable=True),
        sa.Column('agreed_payout', sa.String(78), nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_negotiation_sessions_shop_id', 'negotiation_sessions', ['shop_id'])
    op.create_index('ix_negotiation_sessions_seller_address', 'negotiation_sessions', ['seller_address'])
    op.create_index('ix_negotiation_sessions_settled', 'negotiation_sessions', ['settled'])

    # deal_offers
    op.create_table(
        'deal_offers',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('shop_id', sa.String(64), sa.ForeignKey('shops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('negotiation_id', sa.String(64),
                  sa.ForeignKey('negotiation_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('chain_deal_id', sa.String(66), nullable=False, unique=True),
        sa.Column('seller', sa.String(42), nullable=False),
        sa.Column('input_token', sa.String(42), nullable=False),
        sa.Column('input_amount', sa.String(78), nullable=False),
        sa.Column('payout_amount', sa.String(78), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('state', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_deal_offers_shop_id', 'deal_offers', ['shop_id'])
    op.create_index('ix_deal_offers_chain_deal_id', 'deal_offers', ['chain_deal_id'])
    op.create_index('ix_deal_offers_seller', 'deal_offers', ['seller'])
    op.create_index('ix_deal_offers_state', 'deal_offers', ['state'])

    # executions
    op.create_table(
        'executions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('shop_id', sa.String(64), sa.ForeignKey('shops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('deal_offer_id', sa.String(64), sa.ForeignKey('deal_offers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tx_hash', sa.String(66), nullable=True),
        sa.Column('payout_sent_wei', sa.String(78), nullable=True),
        sa.Column('tokens_received', sa.String(78), nullable=True),
        sa.Column('state', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_executions_shop_id', 'executions', ['shop_id'])
    op.create_index('ix_executions_tx_hash', 'executions', ['tx_hash'])


def downgrade() -> None:
    op.drop_table('executions')
    op.drop_table('deal_offers')
    op.drop_table('negotiation_sessions')
    op.drop_table('provider_keys')
    op.drop_table('shop_ens_identities')
    op.drop_table('shops')
