"""Integration tests for ENS verification metadata and claim enforcement on shops."""
import httpx
import pytest
from httpx import ASGITransport

import app.api.shops as shops_api
import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app
from app.services.ens import EnsVerificationResult


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
async def test_create_shop_persists_verified_ens_metadata(client, monkeypatch):
    async def fake_verify_ens_route(ens_name: str, owner_address: str) -> EnsVerificationResult:
        return EnsVerificationResult(status="verified", verified_owner_address=owner_address)

    monkeypatch.setattr(shops_api, "verify_ens_route", fake_verify_ens_route)

    response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": "verified-route.eth",
            "display_name": "Verified Route"
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["ens_verification_status"] == "verified"
    assert data["ens_verified_owner_address"] == "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"


@pytest.mark.asyncio
async def test_create_shop_rejects_verified_ens_when_verified_owner_does_not_match_owner(client, monkeypatch):
    async def fake_verify_ens_route(ens_name: str, owner_address: str) -> EnsVerificationResult:
        return EnsVerificationResult(status="verified", verified_owner_address="0x1111111111111111111111111111111111111111")

    monkeypatch.setattr(shops_api, "verify_ens_route", fake_verify_ens_route)

    response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": "mismatch.eth",
            "display_name": "Mismatch Route"
        },
    )

    assert response.status_code == 400, response.text
    assert "verified ENS owner address must match" in response.text


@pytest.mark.asyncio
async def test_create_shop_rejects_second_owner_claim_for_same_ens_route(client, monkeypatch):
    async def fake_verify_ens_route(ens_name: str, owner_address: str) -> EnsVerificationResult:
        if ens_name == "wago.eth" and owner_address.lower() == "0x742d35cc6634c0532925a3b844bc9e7595f0beb0":
            return EnsVerificationResult(status="verified", verified_owner_address=owner_address)
        return EnsVerificationResult(status="manual", verified_owner_address=None)

    monkeypatch.setattr(shops_api, "verify_ens_route", fake_verify_ens_route)

    first = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": "wago.eth",
            "display_name": "Wago Verified"
        },
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/shops",
        json={
            "owner_address": "0x2222222222222222222222222222222222222222",
            "ens_name": "wago.eth",
            "display_name": "Wago Hijack Attempt",
            "ens_verification_status": "manual"
        },
    )

    assert second.status_code == 409, second.text
    assert "already claimed" in second.text
