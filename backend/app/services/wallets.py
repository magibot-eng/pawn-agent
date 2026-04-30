"""Merchant wallet provisioning and provider abstraction."""

from __future__ import annotations

import hashlib
import re
import shlex
import subprocess
from dataclasses import dataclass

from app.config import get_settings
from app.models.shop import Shop, ShopWalletStatus

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


@dataclass
class AwalStatus:
    authenticated: bool
    email: str | None
    raw_output: str


@dataclass
class WalletStatusDetails:
    wallet_provider: str
    wallet_status: str
    merchant_address: str
    wallet_provider_account_id: str | None
    provisioning_mode: str
    authenticated: bool
    authenticated_email: str | None
    balance: str | None
    balance_symbol: str | None


class WalletProvisioningError(Exception):
    """Raised when live wallet provisioning is requested but unavailable."""



def _derive_stub_wallet(shop: Shop) -> tuple[str, str]:
    """Derive deterministic stub provider ids for local/dev provisioning."""
    digest = hashlib.sha256(f"{shop.id}:{shop.ens_name}".encode()).hexdigest()
    address = f"0x{digest[:40]}"
    account_id = f"cdpwa_{digest[:16]}"
    return account_id, address


def _run_awal(args: list[str]) -> str:
    """Run the configured awal CLI command and return stdout.

    Raises WalletProvisioningError on command failures.
    """
    settings = get_settings()
    base_cmd = shlex.split(settings.cdp_wallet_cli_command)
    proc = subprocess.run(
        base_cmd + args,
        capture_output=True,
        text=True,
        timeout=45,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "unknown awal error").strip()
        raise WalletProvisioningError(detail)
    return (proc.stdout or "").strip()


def _get_awal_status() -> AwalStatus:
    output = _run_awal(["status"])
    authenticated = "Authenticated\n✓ Authenticated" in output or "✓ Authenticated" in output
    email_match = re.search(r"Logged in as:\s*([^\s]+)", output)
    return AwalStatus(
        authenticated=authenticated,
        email=email_match.group(1) if email_match else None,
        raw_output=output,
    )


def _provision_via_awal() -> tuple[str, str]:
    """Use an authenticated awal session to get the real operational address."""
    settings = get_settings()
    status = _get_awal_status()
    if not status.authenticated:
        raise WalletProvisioningError(
            "CDP Agentic Wallet is not authenticated. Run `npx awal auth login <email>` and `npx awal auth verify <flow-id> <otp>`, or use `npx awal show`."
        )

    address_output = _run_awal(["address", "--chain", settings.cdp_wallet_chain])
    address_match = re.search(r"0x[a-fA-F0-9]{40}", address_output)
    if not address_match:
        raise WalletProvisioningError(f"Could not parse wallet address from awal output: {address_output}")

    email_slug = re.sub(r"[^a-zA-Z0-9]+", "-", status.email or "authenticated")[:32].strip("-") or "authenticated"
    account_id = f"cdpwa_live_{email_slug}_{settings.cdp_wallet_chain}"
    return account_id, address_match.group(0)


def _get_awal_balance() -> tuple[str | None, str | None]:
    settings = get_settings()
    output = _run_awal(["balance", "--chain", settings.cdp_wallet_chain])
    match = re.search(r"([A-Z]{2,10})\s+Balance:\s*([\d.,]+)", output)
    if match:
        return match.group(2).replace(",", ""), match.group(1)
    match = re.search(r"([\d.,]+)\s*([A-Z]{2,10})", output)
    if match:
        return match.group(1).replace(",", ""), match.group(2)
    return None, None


def get_wallet_status_details(shop: Shop) -> WalletStatusDetails:
    """Return display-ready wallet status details for owner UI."""
    provisioning_mode = "stub"
    authenticated = False
    authenticated_email = None
    balance = None
    balance_symbol = None

    settings = get_settings()
    if settings.cdp_wallet_live_enabled and shop.wallet_provider == "cdp_agentic_wallet":
        try:
            status = _get_awal_status()
            if status.authenticated:
                provisioning_mode = "live"
                authenticated = True
                authenticated_email = status.email
                balance, balance_symbol = _get_awal_balance()
        except WalletProvisioningError:
            pass

    return WalletStatusDetails(
        wallet_provider=shop.wallet_provider,
        wallet_status=shop.wallet_status,
        merchant_address=shop.merchant_address,
        wallet_provider_account_id=shop.wallet_provider_account_id,
        provisioning_mode=provisioning_mode,
        authenticated=authenticated,
        authenticated_email=authenticated_email,
        balance=balance,
        balance_symbol=balance_symbol,
    )


async def provision_managed_wallet(shop: Shop) -> Shop:
    """Provision or return the managed merchant wallet for a shop.

    Live mode uses a locally authenticated CDP Agentic Wallet (`awal`) session.
    If unavailable and fallback is enabled, use a deterministic stub wallet.
    """
    if (
        shop.wallet_status == ShopWalletStatus.ACTIVE
        and shop.merchant_address
        and shop.merchant_address != ZERO_ADDRESS
        and shop.wallet_provider_account_id
    ):
        return shop

    if shop.wallet_provider != "cdp_agentic_wallet":
        raise ValueError(f"Unsupported wallet provider: {shop.wallet_provider}")

    settings = get_settings()

    try:
        if settings.cdp_wallet_live_enabled:
            account_id, address = _provision_via_awal()
        else:
            raise WalletProvisioningError("Live CDP wallet mode is disabled.")
    except WalletProvisioningError:
        if not settings.cdp_wallet_fallback_to_stub:
            raise
        account_id, address = _derive_stub_wallet(shop)

    shop.wallet_provider_account_id = account_id
    shop.merchant_address = address
    shop.wallet_status = ShopWalletStatus.ACTIVE
    return shop
