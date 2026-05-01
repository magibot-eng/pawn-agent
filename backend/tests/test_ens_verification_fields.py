"""Integration tests for ENS verification metadata on shops."""
import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_path = tmp_path / "ens-verification.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    config_module.get_settings.cache_clear()
    db_module._engine = None
    db_module._session_factory = None

    await init_db()
    app = create_app()

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    if db_module._engine is not None:
        await db_module._engine.dispose()
    db_module._engine = None
    db_module._session_factory = None
    config_module.get_settings.cache_clear()


@pytest.mark.asyncio
async def test_create_shop_persists_verified_ens_metadata(client):
    response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": "verified-route.eth",
            "display_name": "Verified Route",
            "ens_verification_status": "verified",
            "ens_verified_owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["ens_verification_status"] == "verified"
    assert data["ens_verified_owner_address"] == "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
