import uuid
from types import SimpleNamespace

import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app
from app.services import settlements as settlement_service
from app.services import wallets as wallet_service


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_path = tmp_path / "quote-acceptance.db"
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


async def _create_shop_with_wallet(client: httpx.AsyncClient) -> dict:
    shop_response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": f"accept-{uuid.uuid4().hex[:8]}.eth",
            "display_name": "Acceptance Test Shop",
            "description": "Test shop",
            "merchant_persona": "Direct and skeptical.",
            "buying_preferences": "Distressed tokens",
            "pricing_style": "Conservative",
            "refusal_rules": "No unclear assets",
            "welcome_message": "State your cargo.",
            "payout_token": "USDC",
        },
    )
    assert shop_response.status_code == 201, shop_response.text
    shop = shop_response.json()

    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text
    return provision.json()


async def _create_negotiation(client: httpx.AsyncClient, shop_id: str) -> dict:
    response = await client.post(
        "/negotiations",
        json={
            "shop_id": shop_id,
            "seller_address": "0x1111111111111111111111111111111111111111",
            "input_token": "TIDE",
            "input_amount": "18000",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_accept_quote_submits_base_sepolia_eth_settlement(client, monkeypatch):
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
    monkeypatch.setattr(settlement_service, "get_settings", wallet_service.get_settings)

    awal_calls: list[list[str]] = []

    def fake_run_awal(args: list[str]) -> str:
        awal_calls.append(args)
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["address", "--chain", "base-sepolia"]:
            return "0x1234567890abcdef1234567890abcdef12345678"
        if args == [
            "send",
            "0.0001",
            "0x1111111111111111111111111111111111111111",
            "--chain",
            "base-sepolia",
            "--asset",
            "ETH",
            "--json",
        ]:
            return '{"status":"submitted","transactionHash":"0xabc123"}'
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)
    monkeypatch.setattr(settlement_service, "_run_awal", fake_run_awal)

    shop = await _create_shop_with_wallet(client)
    negotiation = await _create_negotiation(client, shop["id"])

    response = await client.post(
        f"/negotiations/{negotiation['id']}/accept",
        json={
            "payout_token": "ETH",
            "payout_amount": "0.0001",
            "expiry": "5m",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["success"] is True
    assert data["deal_offer"]["shop_id"] == shop["id"]
    assert data["deal_offer"]["negotiation_id"] == negotiation["id"]
    assert data["deal_offer"]["seller"] == negotiation["seller_address"]
    assert data["deal_offer"]["input_token"] == "TIDE"
    assert data["deal_offer"]["input_amount"] == "18000"
    assert data["deal_offer"]["payout_amount"] == "0.0001"
    assert data["execution"]["shop_id"] == shop["id"]
    assert data["execution"]["deal_offer_id"] == data["deal_offer"]["id"]
    assert data["execution"]["state"] == "submitted"
    assert data["execution"]["tx_hash"] == "0xabc123"
    assert data["execution"]["payout_sent_wei"] == "100000000000000"
    assert data["execution"]["tokens_received"] == "18000"
    assert any(call[:1] == ["send"] for call in awal_calls)

    updated_negotiation = await client.get(f"/negotiations/{negotiation['id']}")
    assert updated_negotiation.status_code == 200, updated_negotiation.text
    negotiation_data = updated_negotiation.json()
    assert negotiation_data["settled"] is True
    assert negotiation_data["agreed_payout"] == "0.0001"


@pytest.mark.asyncio
async def test_accept_quote_rejects_non_eth_payout_for_live_settlement(client, monkeypatch):
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
    monkeypatch.setattr(settlement_service, "get_settings", wallet_service.get_settings)

    def fake_run_awal(args: list[str]) -> str:
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["address", "--chain", "base-sepolia"]:
            return "0x1234567890abcdef1234567890abcdef12345678"
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)
    monkeypatch.setattr(settlement_service, "_run_awal", fake_run_awal)

    shop = await _create_shop_with_wallet(client)
    negotiation = await _create_negotiation(client, shop["id"])

    response = await client.post(
        f"/negotiations/{negotiation['id']}/accept",
        json={
            "payout_token": "USDC",
            "payout_amount": "15.3",
            "expiry": "5m",
        },
    )

    assert response.status_code == 400, response.text
    assert "eth" in response.text.lower()


@pytest.mark.asyncio
async def test_accept_quote_requires_active_merchant_wallet(client):
    shop_response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": f"pending-{uuid.uuid4().hex[:8]}.eth",
            "display_name": "Pending Wallet Shop",
            "description": "Test shop",
            "merchant_persona": "Direct and skeptical.",
            "buying_preferences": "Distressed tokens",
            "pricing_style": "Conservative",
            "refusal_rules": "No unclear assets",
            "welcome_message": "State your cargo.",
            "payout_token": "USDC",
        },
    )
    assert shop_response.status_code == 201, shop_response.text
    shop = shop_response.json()
    negotiation = await _create_negotiation(client, shop["id"])

    response = await client.post(
        f"/negotiations/{negotiation['id']}/accept",
        json={
            "payout_token": "USDC",
            "payout_amount": "15300",
            "expiry": "5m",
        },
    )

    assert response.status_code == 400, response.text
    assert "merchant wallet" in response.text.lower()
