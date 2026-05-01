"""Regression tests for lightweight SQLite startup migrations."""

import sqlite3

import pytest

import app.config as config_module
import app.db as db_module
from app.db import init_db


@pytest.mark.asyncio
async def test_init_db_adds_missing_negotiation_quote_columns(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-negotiation.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE shops (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            owner_address VARCHAR(42) NOT NULL,
            ens_name VARCHAR(256) NOT NULL,
            display_name VARCHAR(256) NOT NULL,
            description TEXT,
            status VARCHAR(16) NOT NULL DEFAULT 'draft',
            contract_address VARCHAR(42),
            payout_token VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
            merchant_address VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE TABLE negotiation_sessions (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            shop_id VARCHAR(64) NOT NULL,
            seller_address VARCHAR(42) NOT NULL,
            input_token VARCHAR(42) NOT NULL,
            input_amount VARCHAR(78) NOT NULL,
            settled BOOLEAN NOT NULL DEFAULT 0,
            chat_log TEXT NOT NULL DEFAULT '[]',
            outcome VARCHAR(32),
            agreed_payout VARCHAR(78),
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );
        """
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    config_module.get_settings.cache_clear()
    db_module._engine = None
    db_module._session_factory = None

    await init_db()

    if db_module._engine is not None:
        await db_module._engine.dispose()
    db_module._engine = None
    db_module._session_factory = None
    config_module.get_settings.cache_clear()

    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(negotiation_sessions)").fetchall()}
    conn.close()

    assert "negotiation_state" in columns
    assert "seller_ask_token" in columns
    assert "seller_ask_amount" in columns
    assert "seller_ask_price" in columns
    assert "merchant_quote_token" in columns
    assert "merchant_quote_amount" in columns
    assert "merchant_quote_expiry" in columns
    assert "quote_status" in columns


@pytest.mark.asyncio
async def test_init_db_adds_missing_shop_ens_verification_columns(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-shops.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE shops (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            owner_address VARCHAR(42) NOT NULL,
            ens_name VARCHAR(256) NOT NULL,
            display_name VARCHAR(256) NOT NULL,
            description TEXT,
            status VARCHAR(16) NOT NULL DEFAULT 'draft',
            contract_address VARCHAR(42),
            payout_token VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
            merchant_address VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    config_module.get_settings.cache_clear()
    db_module._engine = None
    db_module._session_factory = None

    await init_db()

    if db_module._engine is not None:
        await db_module._engine.dispose()
    db_module._engine = None
    db_module._session_factory = None
    config_module.get_settings.cache_clear()

    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(shops)").fetchall()}
    conn.close()

    assert "ens_verification_status" in columns
    assert "ens_verified_owner_address" in columns
