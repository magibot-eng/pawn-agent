import uuid
from types import SimpleNamespace

import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app
from app.services import wallets as wallet_service


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_path = tmp_path / "wallet-funding.db"
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


async def _create_shop(client: httpx.AsyncClient) -> dict:
    response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": f"funding-{uuid.uuid4().hex[:8]}.eth",
            "display_name": "Funding Test Shop",
            "description": "Funding test shop",
            "merchant_persona": "Direct and skeptical.",
            "buying_preferences": "Distressed tokens",
            "pricing_style": "Conservative",
            "refusal_rules": "No unclear assets",
            "welcome_message": "State your cargo.",
            "payout_token": "0x0000000000000000000000000000000000000000",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_withdraw_to_owner_uses_live_merchant_wallet(client, monkeypatch):
    monkeypatch.setattr(
        wallet_service,
        "get_settings",
        lambda: SimpleNamespace(
            cdp_wallet_live_enabled=True,
            cdp_wallet_fallback_to_stub=False,
            cdp_wallet_chain="base-sepolia",
            cdp_wallet_cli_command="npx awal",
        ),
    )

    awal_calls: list[list[str]] = []

    def fake_run_awal(args: list[str]) -> str:
        awal_calls.append(args)
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["address", "--chain", "base-sepolia"]:
            return "0x1234567890abcdef1234567890abcdef12345678"
        if args == [
            "send",
            "0.0003",
            "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "--chain",
            "base-sepolia",
            "--asset",
            "ETH",
            "--json",
        ]:
            return '{"status":"submitted","transactionHash":"0xdef456"}'
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)

    shop = await _create_shop(client)
    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text

    response = await client.post(
        f"/shops/{shop['id']}/wallet/withdraw",
        json={"amount_eth": "0.0003"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data == {
        "success": True,
        "recipient_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "amount_eth": "0.0003",
        "amount_wei": "300000000000000",
        "state": "submitted",
        "tx_hash": "0xdef456",
    }
    assert any(call[:1] == ["send"] for call in awal_calls)


@pytest.mark.asyncio
async def test_withdraw_to_owner_rejects_stub_wallet(client):
    shop = await _create_shop(client)
    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text

    response = await client.post(
        f"/shops/{shop['id']}/wallet/withdraw",
        json={"amount_eth": "0.0003"},
    )

    assert response.status_code == 400, response.text
    assert "live" in response.text.lower()
