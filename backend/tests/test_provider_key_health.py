import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_path = tmp_path / "provider-key-health.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setenv(
        "PAWN_AGENT_MASTER_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    )

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
async def test_test_active_provider_key_returns_success(client, monkeypatch):
    async def fake_call_llm(provider, api_key, model, system_prompt, user_message, chat_history):
        assert provider == "openai"
        assert api_key == "sk-test-key"
        assert user_message == "ping"
        return "connection ok"

    monkeypatch.setattr("app.services.provider_keys.call_llm", fake_call_llm)

    shop_payload = {
        "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "merchant_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "ens_name": "provider-health-test.eth",
        "display_name": "Provider Health Test",
        "description": "Test shop",
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

    key_response = await client.post(
        f"/shops/{shop_id}/provider-keys",
        json={
            "provider": "openai",
            "model": "gpt-4.1-mini",
            "label": "Owner dashboard",
            "encrypted_key": "sk-test-key",
        },
    )
    assert key_response.status_code == 201, key_response.text

    test_response = await client.post(f"/shops/{shop_id}/provider-keys/test-active")
    assert test_response.status_code == 200, test_response.text
    assert test_response.json() == {
        "ok": True,
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "message": "connection ok",
        "error": None,
    }
