"""Run DB migration to create all tables in PostgreSQL.

This script creates all tables matching the SQLAlchemy model definitions.
Run via: python migrate_pg.py

NOTE: This script uses CREATE TABLE IF NOT EXISTS, so it is safe to re-run
on an existing database. For production, prefer Alembic migrations.
"""
import asyncio
from sqlalchemy import text
from app.db import get_engine


async def migrate():
    engine = get_engine()
    async with engine.begin() as conn:
        # Shops — full schema matching Shop model
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
                wallet_encrypted_key TEXT,
                wallet_status VARCHAR(16) NOT NULL DEFAULT 'pending',
                auto_settlement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                ens_verification_status VARCHAR(16) NOT NULL DEFAULT 'manual',
                ens_verified_owner_address VARCHAR(42),
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

        # provider_keys — column names match ProviderKey model exactly
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS provider_keys (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                provider VARCHAR(32) NOT NULL,
                encrypted_key TEXT NOT NULL,
                model VARCHAR(64),
                label VARCHAR(64),
                last_used_at TIMESTAMP WITH TIME ZONE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("provider_keys OK")

        # negotiation_sessions — full schema matching NegotiationSession model
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS negotiation_sessions (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                seller_address VARCHAR(42) NOT NULL,
                input_token VARCHAR(42) NOT NULL,
                input_amount VARCHAR(78) NOT NULL,
                settled BOOLEAN NOT NULL DEFAULT FALSE,
                chat_log TEXT NOT NULL DEFAULT '[]',
                outcome VARCHAR(32),
                negotiation_state JSONB,
                agreed_payout VARCHAR(78),
                error_message TEXT,
                seller_ask_token VARCHAR(42),
                seller_ask_amount VARCHAR(78),
                seller_ask_price VARCHAR(78),
                merchant_quote_token VARCHAR(42),
                merchant_quote_amount VARCHAR(78),
                merchant_quote_expiry VARCHAR(32),
                quote_status VARCHAR(16),
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("negotiation_sessions OK")

        # deal_offers — schema matching DealOffer model
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deal_offers (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                negotiation_id VARCHAR(64),
                chain_deal_id VARCHAR(66) NOT NULL UNIQUE,
                seller VARCHAR(42) NOT NULL,
                input_token VARCHAR(42) NOT NULL,
                input_amount VARCHAR(78) NOT NULL,
                payout_amount VARCHAR(78) NOT NULL,
                state VARCHAR(16) NOT NULL DEFAULT 'pending',
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("deal_offers OK")

        # executions — schema matching Execution model
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS executions (
                id VARCHAR(64) PRIMARY KEY,
                shop_id VARCHAR(64) NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
                deal_offer_id VARCHAR(64) NOT NULL,
                tx_hash VARCHAR(66),
                payout_sent_wei VARCHAR(78),
                tokens_received VARCHAR(78),
                state VARCHAR(16) NOT NULL DEFAULT 'pending',
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
            "CREATE INDEX IF NOT EXISTS idx_negotiations_settled ON negotiation_sessions(settled)",
            "CREATE INDEX IF NOT EXISTS idx_deals_shop ON deal_offers(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_deals_chain ON deal_offers(chain_deal_id)",
            "CREATE INDEX IF NOT EXISTS idx_deals_seller ON deal_offers(seller)",
            "CREATE INDEX IF NOT EXISTS idx_deals_state ON deal_offers(state)",
            "CREATE INDEX IF NOT EXISTS idx_executions_shop ON executions(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_executions_tx ON executions(tx_hash)",
            "CREATE INDEX IF NOT EXISTS idx_provider_keys_shop ON provider_keys(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider)",
            "CREATE INDEX IF NOT EXISTS idx_shop_ens_shop ON shop_ens_identities(shop_id)",
            "CREATE INDEX IF NOT EXISTS idx_shop_ens_name ON shop_ens_identities(ens_name)",
        ]:
            await conn.execute(text(idx_sql))
        print("indexes OK")

        # Add missing columns to existing tables (for databases created with older migrate_pg.py)
        migration_notes = []

        # Add chat_log to negotiation_sessions if missing
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'negotiation_sessions' AND column_name = 'chat_log'
        """))
        if result.fetchone() is None:
            await conn.execute(text(
                "ALTER TABLE negotiation_sessions ADD COLUMN chat_log TEXT NOT NULL DEFAULT '[]'"
            ))
            migration_notes.append("added negotiation_sessions.chat_log")

        # Add missing provider_keys columns if missing
        for col_spec in [('model', 'VARCHAR(64)'), ('label', 'VARCHAR(64)'), ('last_used_at', 'TIMESTAMP WITH TIME ZONE')]:
            col_name, col_type = col_spec
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'provider_keys' AND column_name = :col"
            ), {'col': col_name})
            if result.fetchone() is None:
                await conn.execute(text(
                    'ALTER TABLE provider_keys ADD COLUMN {} {}'.format(col_name, col_type)
                ))
                migration_notes.append(f"added provider_keys.{col_name}")

        if migration_notes:
            print("Patched existing tables:", ', '.join(migration_notes))

        print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
