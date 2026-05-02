"""SQLAlchemy async engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for all models."""
    pass


_engine = None
_session_factory = None


def _parse_database_url(url: str) -> tuple[str, dict]:
    """Strip libpq sslmode param from URL, return (clean_url, ssl_connect_arg)."""
    from urllib.parse import urlparse, parse_qs, urlencode
    import ssl

    parsed = urlparse(url)
    if parsed.scheme not in ("postgresql", "postgresql+asyncpg"):
        return url, {}

    params = parse_qs(parsed.query)
    ssl_arg = {}
    if "sslmode" in params:
        mode = params["sslmode"][0]
        del params["sslmode"]
        # asyncpg requires an ssl.SSLContext for fine-grained control
        if mode in ("no-verify", "require"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            ssl_arg["ssl"] = ctx
        # Rebuild URL without sslmode
        new_query = urlencode(params, doseq=True)
        clean_url = parsed._replace(query=new_query).geturl()
        return clean_url, ssl_arg
    return url, {}


def get_engine():
    """Lazily create the async engine (one per process)."""
    global _engine
    if _engine is None:
        settings = get_settings()
        url, ssl_connect_arg = _parse_database_url(settings.database_url)
        engine_kwargs: dict = {"echo": settings.debug}
        if url.startswith("sqlite"):
            engine_kwargs["connect_args"] = {"check_same_thread": False}
        elif ssl_connect_arg:
            engine_kwargs["connect_args"] = ssl_connect_arg
        _engine = create_async_engine(
            url,
            **engine_kwargs,
        )
    return _engine


def get_session_factory():
    """Lazily create the session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a session and ensures it closes after."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


SHOP_COLUMN_MIGRATIONS = {
    "merchant_persona": "TEXT",
    "buying_preferences": "TEXT",
    "pricing_style": "TEXT",
    "refusal_rules": "TEXT",
    "welcome_message": "TEXT",
    "merchant_portrait": "VARCHAR(64) NOT NULL DEFAULT 'brass-ledger-broker'",
    "wallet_provider": "VARCHAR(32) NOT NULL DEFAULT 'cdp_agentic_wallet'",
    "wallet_provider_account_id": "VARCHAR(128)",
    "wallet_status": "VARCHAR(16) NOT NULL DEFAULT 'pending'",
    "auto_settlement_enabled": "BOOLEAN NOT NULL DEFAULT 0",
    "ens_verification_status": "VARCHAR(16) NOT NULL DEFAULT 'manual'",
    "ens_verified_owner_address": "VARCHAR(42)",
    "wallet_encrypted_key": "TEXT",
}

NEGOTIATION_COLUMN_MIGRATIONS = {
    "negotiation_state": "TEXT",
    "seller_ask_token": "VARCHAR(42)",
    "seller_ask_amount": "VARCHAR(78)",
    "seller_ask_price": "VARCHAR(78)",
    "merchant_quote_token": "VARCHAR(42)",
    "merchant_quote_amount": "VARCHAR(78)",
    "merchant_quote_expiry": "VARCHAR(32)",
    "quote_status": "VARCHAR(16)",
}


def _ensure_sqlite_shop_columns(sync_conn) -> None:
    if sync_conn.dialect.name != "sqlite":
        return

    existing_columns = {
        row[1] for row in sync_conn.exec_driver_sql("PRAGMA table_info(shops)").fetchall()
    }
    for column_name, column_type in SHOP_COLUMN_MIGRATIONS.items():
        if column_name not in existing_columns:
            sync_conn.exec_driver_sql(
                f"ALTER TABLE shops ADD COLUMN {column_name} {column_type}"
            )


def _ensure_sqlite_negotiation_columns(sync_conn) -> None:
    if sync_conn.dialect.name != "sqlite":
        return

    existing_columns = {
        row[1] for row in sync_conn.exec_driver_sql("PRAGMA table_info(negotiation_sessions)").fetchall()
    }
    for column_name, column_type in NEGOTIATION_COLUMN_MIGRATIONS.items():
        if column_name not in existing_columns:
            sync_conn.exec_driver_sql(
                f"ALTER TABLE negotiation_sessions ADD COLUMN {column_name} {column_type}"
            )


async def init_db() -> None:
    """Create all tables. Call once on app startup."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_sqlite_shop_columns)
        await conn.run_sync(_ensure_sqlite_negotiation_columns)
