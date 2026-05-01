import uuid
from types import SimpleNamespace

import httpx
import pytest
from httpx import ASGITransport

import app.config as config_module
import app.db as db_module
from app.db import init_db
from app.main import create_app
from app.models.shop import ShopWalletStatus
from app.services import wallets as wallet_service


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_path = tmp_path / "wallet-provisioning.db"
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


async def _create_pending_shop(client: httpx.AsyncClient) -> dict:
    response = await client.post(
        "/shops",
        json={
            "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            "ens_name": f"provision-{uuid.uuid4().hex[:8]}.eth",
            "display_name": "Provision Test",
            "description": "Pending merchant wallet",
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
async def test_provision_shop_wallet_activates_managed_wallet(client):
    shop = await _create_pending_shop(client)

    response = await client.post(f"/shops/{shop['id']}/wallet/provision")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["wallet_provider"] == "cdp_agentic_wallet"
    assert data["wallet_status"] == "active"
    assert data["wallet_provider_account_id"]
    assert data["merchant_address"].startswith("0x")
    assert data["merchant_address"] != "0x0000000000000000000000000000000000000000"


@pytest.mark.asyncio
async def test_provision_shop_wallet_is_idempotent_for_active_wallet(client):
    shop = await _create_pending_shop(client)

    first = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert first.status_code == 200, first.text
    first_data = first.json()

    second = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert second.status_code == 200, second.text
    second_data = second.json()

    assert second_data["merchant_address"] == first_data["merchant_address"]
    assert second_data["wallet_provider_account_id"] == first_data["wallet_provider_account_id"]
    assert second_data["wallet_status"] == "active"


def test_provision_managed_wallet_uses_live_awal_when_enabled(monkeypatch):
    shop = SimpleNamespace(
        id="shop-1",
        ens_name="live-test.eth",
        wallet_provider="cdp_agentic_wallet",
        wallet_status="pending",
        merchant_address="0x0000000000000000000000000000000000000000",
        wallet_provider_account_id=None,
    )

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

    def fake_run_awal(args: list[str]) -> str:
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["address", "--chain", "base-sepolia"]:
            return "0x1234567890abcdef1234567890abcdef12345678"
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)

    import asyncio
    result = asyncio.run(wallet_service.provision_managed_wallet(shop))

    assert result.wallet_status == ShopWalletStatus.ACTIVE
    assert result.merchant_address == "0x1234567890abcdef1234567890abcdef12345678"
    assert result.wallet_provider_account_id == "cdpwa_live_agent-example-com_base-sepolia"


def test_provision_managed_wallet_falls_back_to_stub_when_live_unavailable(monkeypatch):
    shop = SimpleNamespace(
        id="shop-2",
        ens_name="stub-test.eth",
        wallet_provider="cdp_agentic_wallet",
        wallet_status="pending",
        merchant_address="0x0000000000000000000000000000000000000000",
        wallet_provider_account_id=None,
    )

    monkeypatch.setattr(
        wallet_service,
        "get_settings",
        lambda: SimpleNamespace(
            cdp_wallet_live_enabled=True,
            cdp_wallet_fallback_to_stub=True,
            cdp_wallet_chain="base-sepolia",
            cdp_wallet_cli_command="npx awal",
        ),
    )

    def fake_run_awal(args: list[str]) -> str:
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n⚠ Not authenticated"
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)

    import asyncio
    result = asyncio.run(wallet_service.provision_managed_wallet(shop))

    assert result.wallet_status == ShopWalletStatus.ACTIVE
    assert result.merchant_address.startswith("0x")
    assert result.merchant_address != "0x0000000000000000000000000000000000000000"
    assert result.wallet_provider_account_id.startswith("cdpwa_")


@pytest.mark.asyncio
async def test_wallet_status_endpoint_reports_stub_wallet_details(client):
    shop = await _create_pending_shop(client)
    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text

    response = await client.get(f"/shops/{shop['id']}/wallet/status")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["wallet_provider"] == "cdp_agentic_wallet"
    assert data["wallet_status"] == "active"
    assert data["merchant_address"].startswith("0x")
    assert data["provisioning_mode"] == "stub"
    assert data["authenticated"] is False
    assert data["balance"] is None


@pytest.mark.asyncio
async def test_wallet_status_endpoint_reports_live_awal_details(client, monkeypatch):
    shop = await _create_pending_shop(client)
    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text

    monkeypatch.setattr(
        wallet_service,
        "get_settings",
        lambda: SimpleNamespace(
            cdp_wallet_live_enabled=True,
            cdp_wallet_fallback_to_stub=True,
            cdp_wallet_chain="base-sepolia",
            cdp_wallet_cli_command="npx awal",
        ),
    )

    def fake_run_awal(args: list[str]) -> str:
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["balance", "--chain", "base-sepolia", "--json"]:
            return '{"chain":"base-sepolia","balances":[]}'
        if args == ["balance", "--chain", "base-sepolia"]:
            return "USDC Balance: 12.34"
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)

    response = await client.get(f"/shops/{shop['id']}/wallet/status")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["provisioning_mode"] == "live"
    assert data["authenticated"] is True
    assert data["authenticated_email"] == "agent@example.com"
    assert data["balance"] == "12.34"
    assert data["balance_symbol"] == "USDC"


@pytest.mark.asyncio
async def test_wallet_status_endpoint_reports_live_holdings(client, monkeypatch):
    shop = await _create_pending_shop(client)
    provision = await client.post(f"/shops/{shop['id']}/wallet/provision")
    assert provision.status_code == 200, provision.text

    monkeypatch.setattr(
        wallet_service,
        "get_settings",
        lambda: SimpleNamespace(
            cdp_wallet_live_enabled=True,
            cdp_wallet_fallback_to_stub=True,
            cdp_wallet_chain="base-sepolia",
            cdp_wallet_cli_command="npx awal",
        ),
    )

    def fake_run_awal(args: list[str]) -> str:
        if args == ["status"]:
            return "Wallet Server\n✓ Running\n\nAuthentication\n✓ Authenticated\nLogged in as: agent@example.com"
        if args == ["balance", "--chain", "base-sepolia", "--json"]:
            return '{"chain":"base-sepolia","balances":[{"asset":"ETH","balance":"0.42"},{"asset":"USDC","balance":"15.50"}]}'
        if args == ["balance", "--chain", "base-sepolia"]:
            return "ETH Balance: 0.42"
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(wallet_service, "_run_awal", fake_run_awal)

    response = await client.get(f"/shops/{shop['id']}/wallet/status")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["holdings"] == [
        {"asset": "ETH", "balance": "0.42", "chain": "base-sepolia"},
        {"asset": "USDC", "balance": "15.50", "chain": "base-sepolia"},
    ]
