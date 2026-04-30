"""SQLAlchemy async engine and session management for SQLite."""

from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for all models."""
    pass


_engine = None
_session_factory = None


def get_engine():
    """Lazily create the async engine (one per process)."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            connect_args={"check_same_thread": False},
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


async def init_db() -> None:
    """Create all tables. Call once on app startup."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_sqlite_shop_columns)
