"""Integration tests for structured negotiation-state extraction and persistence."""

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
    db_path = tmp_path / "negotiation-state-test.db"
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


async def _create_shop_and_negotiation(client: httpx.AsyncClient) -> tuple[str, str]:
    shop_payload = {
        "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "merchant_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "ens_name": f"state-{uuid.uuid4().hex[:8]}.pawn.eth",
        "display_name": "State Test Shop",
        "description": "Test shop for structured negotiation state",
        "merchant_persona": "Direct and skeptical.",
        "buying_preferences": "Distressed tokens",
        "pricing_style": "Conservative",
        "refusal_rules": "No unclear assets",
        "welcome_message": "State your cargo.",
        "payout_token": "0x0000000000000000000000000000000000000000",
    }
    shop_response = await client.post("/shops", json=shop_payload)
    assert shop_response.status_code == 201, shop_response.text
    shop_id = shop_response.json()["id"]

    negotiation_payload = {
        "shop_id": shop_id,
        "seller_address": "0x1111111111111111111111111111111111111111",
        "input_token": "0x0000000000000000000000000000000000000000",
        "input_amount": "18000",
    }
    negotiation_response = await client.post("/negotiations", json=negotiation_payload)
    assert negotiation_response.status_code == 201, negotiation_response.text
    negotiation_id = negotiation_response.json()["id"]
    return shop_id, negotiation_id


@pytest.mark.asyncio
async def test_chat_response_includes_structured_negotiation_state(client):
    _, negotiation_id = await _create_shop_and_negotiation(client)

    response = await client.post(
        f"/negotiations/{negotiation_id}/chat",
        json={"message": "I need to move 18,000 TIDE urgently. I'm asking 4200 USDC today."},
    )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["response_mode"] == "scripted_fallback"
    assert data["negotiation_state"] == {
        "token": "TIDE",
        "amount": "18000",
        "seller_ask": "4200 USDC",
        "urgency": "high",
        "merchant_stance": "reviewing",
        "next_action": "provide token contract",
    }


@pytest.mark.asyncio
async def test_negotiation_state_persists_on_session_record(client):
    _, negotiation_id = await _create_shop_and_negotiation(client)

    chat_response = await client.post(
        f"/negotiations/{negotiation_id}/chat",
        json={"message": "Looking to sell 18,000 TIDE. Need 4200 USDC ASAP."},
    )
    assert chat_response.status_code == 200, chat_response.text

    negotiation_response = await client.get(f"/negotiations/{negotiation_id}")
    assert negotiation_response.status_code == 200, negotiation_response.text
    negotiation = negotiation_response.json()

    assert negotiation["negotiation_state"] == {
        "token": "TIDE",
        "amount": "18000",
        "seller_ask": "4200 USDC",
        "urgency": "high",
        "merchant_stance": "reviewing",
        "next_action": "provide token contract",
    }
