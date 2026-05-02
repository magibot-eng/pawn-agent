"""Run DB migration to create all tables in PostgreSQL."""
import asyncio
from sqlalchemy import text
from app.db import get_engine


async def migrate():
    engine = get_engine()
    async with engine.begin() as conn:
        # Shops
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shops (
                id VARCHAR(64) PRIMARY KEY,
                owner_address VARCHAR(42) NOT NULL,
                ens_name VARCHAR(256) NOT NULL,
                display_name VARCHAR(256) NOT NULL,
                description TEXT,
                merchant_persona TEXT,
                buying_preferences TEXT,
                pricing_style TEXT,
                refusal_rules TEXT,
                welcome_message TEXT,
                merchant_portrait VARCHAR(64) NOT NULL DEFAULT 'brass-ledger-broker',
                status VARCHAR(16) NOT NULL DEFAULT 'draft',
                contract_address VARCHAR(42),
                payout_token VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
                merchant_address VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
                wallet_provider VARCHAR(32) NOT NULL DEFAULT 'cdp_agentic_wallet',
                wallet_provider_account_id VARCHAR(128),
                wallet_status VARCHAR(16) NOT NULL DEFAULT 'pending',
                auto_settlement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                ens_verification_status VARCHAR(16) NOT NULL DEFAULT 'manual',
                ens_verified_owner_address VARCHAR(42),
                wallet_encrypted_key TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("shops OK")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shop_ens_identities (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                ens_name VARCHAR(256) NOT NULL,
                ens_type VARCHAR(32) NOT NULL DEFAULT 'subdomain',
                is_primary BOOLEAN DEFAULT FALSE,
                resolver_address VARCHAR(42),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("shop_ens_identities OK")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS provider_keys (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                provider_name VARCHAR(64) NOT NULL,
                key_name VARCHAR(128) NOT NULL,
                encrypted_key_value TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("provider_keys OK")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS negotiation_sessions (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                seller_address VARCHAR(42) NOT NULL,
                seller_ens VARCHAR(256),
                input_token VARCHAR(42) NOT NULL,
                input_amount VARCHAR(78) NOT NULL,
                outcome VARCHAR(32),
                quote_status VARCHAR(16),
                negotiation_state TEXT,
                seller_ask_token VARCHAR(42),
                seller_ask_amount VARCHAR(78),
                seller_ask_price VARCHAR(78),
                merchant_quote_token VARCHAR(42),
                merchant_quote_amount VARCHAR(78),
                merchant_quote_expiry VARCHAR(32),
                agreed_payout VARCHAR(78),
                expires_at TIMESTAMP WITH TIME ZONE,
                settled BOOLEAN DEFAULT FALSE,
                error_message TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("negotiation_sessions OK")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deal_offers (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                negotiation_id VARCHAR(64) NOT NULL,
                chain_deal_id VARCHAR(66),
                seller VARCHAR(42) NOT NULL,
                input_token VARCHAR(42) NOT NULL,
                input_amount VARCHAR(78) NOT NULL,
                payout_amount VARCHAR(78) NOT NULL,
                state VARCHAR(16) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("deal_offers OK")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS executions (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                deal_offer_id VARCHAR(64) NOT NULL,
                tx_hash VARCHAR(66),
                payout_sent_wei VARCHAR(78),
                tokens_received VARCHAR(78) NOT NULL,
                state VARCHAR(16) NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("executions OK")

        # Indexes
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_address)",
            "CREATE INDEX IF NOT EXISTS idx_shops_ens ON shops(ens_name)",
            "CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status)",
            "CREATE INDEX IF NOT EXISTS idx_negotiations_shop ON negotiation_sessions(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_negotiations_seller ON negotiation_sessions(seller_address)",
            "CREATE INDEX IF NOT EXISTS idx_deals_shop ON deal_offers(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_executions_shop ON executions(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_provider_keys_shop ON provider_keys(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_shop_ens_shop ON shop_ens_identities(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_shop_ens_name ON shop_ens_identities(ens_name)",
        ]:
            await conn.execute(text(idx_sql))
        print("indexes OK")

        print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
