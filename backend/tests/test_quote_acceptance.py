import uuid

import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app


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
async def test_accept_quote_creates_offer_and_execution(client):
    shop = await _create_shop_with_wallet(client)
    negotiation = await _create_negotiation(client, shop["id"])

    response = await client.post(
        f"/negotiations/{negotiation['id']}/accept",
        json={
            "payout_token": "USDC",
            "payout_amount": "15300",
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
    assert data["deal_offer"]["payout_amount"] == "15300"
    assert data["execution"]["shop_id"] == shop["id"]
    assert data["execution"]["deal_offer_id"] == data["deal_offer"]["id"]
    assert data["execution"]["state"] == "confirmed"
    assert data["execution"]["tx_hash"].startswith("0x")
    assert data["execution"]["payout_sent_wei"] == "15300"
    assert data["execution"]["tokens_received"] == "18000"

    updated_negotiation = await client.get(f"/negotiations/{negotiation['id']}")
    assert updated_negotiation.status_code == 200, updated_negotiation.text
    negotiation_data = updated_negotiation.json()
    assert negotiation_data["settled"] is True
    assert negotiation_data["agreed_payout"] == "15300"


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
