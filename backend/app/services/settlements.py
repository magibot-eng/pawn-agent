"""Quote acceptance and settlement orchestration."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.deal import DealOffer, Execution
from app.models.negotiation import NegotiationSession
from app.models.shop import Shop, ShopWalletStatus
from app.services.wallets import (
    ZERO_ADDRESS,
    WalletProvisioningError,
    AlchemyClient,
    _decrypt_privkey,
    _alchemy_rpc_url,
)


class SettlementError(Exception):
    """Raised when an accepted quote cannot proceed to settlement."""


def _parse_expiry_label(expiry: str) -> datetime:
    now = datetime.now(timezone.utc)
    if expiry.endswith("m") and expiry[:-1].isdigit():
        return now + timedelta(minutes=int(expiry[:-1]))
    if expiry.endswith("h") and expiry[:-1].isdigit():
        return now + timedelta(hours=int(expiry[:-1]))
    return now + timedelta(minutes=5)


def _deal_id(seed: str) -> str:
    return "0x" + hashlib.sha256(seed.encode()).hexdigest()


def _is_eth_payout_token(token: str) -> bool:
    normalized = (token or "").strip().lower()
    return normalized in {"eth", ZERO_ADDRESS.lower()}


def _eth_amount_to_wei(amount: str) -> str:
    try:
        decimal_amount = Decimal(amount)
    except InvalidOperation as exc:
        raise SettlementError(f"Invalid ETH payout amount: {amount}") from exc

    if decimal_amount <= 0:
        raise SettlementError("ETH payout amount must be greater than zero.")

    wei_amount = decimal_amount * Decimal("1000000000000000000")
    if wei_amount != wei_amount.to_integral_value():
        raise SettlementError("ETH payout amount must use 18 decimals or fewer.")

    return str(int(wei_amount))


def _submit_eth_settlement(shop: Shop, recipient: str, payout_amount: str) -> tuple[str, str, str]:
    """Send ETH from the merchant wallet to the seller via Alchemy SDK."""
    settings = get_settings()
    if not settings.cdp_wallet_live_enabled:
        raise SettlementError("Live wallet mode must be enabled for real Base Sepolia settlement. Set CDP_WALLET_LIVE_ENABLED=true.")
    if not settings.alchemy_api_key:
        raise SettlementError("ALCHEMY_API_KEY is not set.")
    if not settings.alchemy_wallet_master_seed:
        raise SettlementError("ALCHEMY_WALLET_MASTER_SEED is not set.")

    payout_sent_wei = _eth_amount_to_wei(payout_amount)

    encrypted_key = shop.wallet_encrypted_key
    if not encrypted_key:
        raise SettlementError("Merchant wallet private key not found. Re-provision the wallet.")
    privkey = _decrypt_privkey(encrypted_key, settings.master_encryption_key)

    try:
        client = AlchemyClient(_alchemy_rpc_url())
        tx_hash, state = client.send_eth(privkey, recipient, int(payout_sent_wei))
    except WalletProvisioningError as exc:
        raise SettlementError(f"Base Sepolia settlement failed: {exc}") from exc
    except Exception as exc:
        raise SettlementError(f"Base Sepolia settlement failed: {type(exc).__name__}: {exc}") from exc

    return tx_hash, state, payout_sent_wei


def _simulate_eth_settlement(recipient: str, payout_amount: str, negotiation_id: str) -> tuple[str, str, str]:
    payout_sent_wei = _eth_amount_to_wei(payout_amount)
    fake_hash = "0x" + hashlib.sha256(f"{negotiation_id}:{recipient}:{payout_amount}:simulated".encode()).hexdigest()
    return fake_hash, "simulated", payout_sent_wei


async def accept_quote_and_execute(
    negotiation_id: str,
    payout_token: str,
    payout_amount: str,
    expiry: str,
    db: AsyncSession,
) -> tuple[DealOffer, Execution, NegotiationSession]:
    result = await db.execute(select(NegotiationSession).where(NegotiationSession.id == negotiation_id))
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise SettlementError(f"Negotiation {negotiation_id} not found")

    result = await db.execute(select(Shop).where(Shop.id == negotiation.shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise SettlementError(f"Shop {negotiation.shop_id} not found")

    # Allow stub wallets (merchant_address = ZERO_ADDRESS but wallet_provider_account_id starts with 'stub_')
    is_stub_wallet = (
        shop.wallet_provider_account_id is not None
        and shop.wallet_provider_account_id.startswith("stub_")
    )
    if (
        shop.wallet_status != ShopWalletStatus.ACTIVE
        or not shop.merchant_address
        or (shop.merchant_address == ZERO_ADDRESS and not is_stub_wallet)
    ):
        raise SettlementError("Merchant wallet is not active. Provision the merchant wallet before accepting quotes.")

    simulate_only = False
    settings = get_settings()
    if (
        not settings.cdp_wallet_live_enabled
        or not shop.wallet_provider_account_id
        or not shop.wallet_provider_account_id.startswith(("alchemy_live_", "cdpwa_live_"))
    ):
        simulate_only = True

    if not _is_eth_payout_token(payout_token):
        raise SettlementError("Real Base Sepolia settlement currently supports ETH payouts only.")

    seller = negotiation.seller_address
    if not seller:
        raise SettlementError("Negotiation is missing seller address.")

    chain_deal_id = _deal_id(f"{negotiation.id}:{seller}:{payout_amount}:{datetime.now(timezone.utc).isoformat()}")
    offer = DealOffer(
        id=str(uuid.uuid4()),
        shop_id=shop.id,
        negotiation_id=negotiation.id,
        chain_deal_id=chain_deal_id,
        seller=seller,
        input_token=negotiation.input_token,
        input_amount=str(negotiation.input_amount),
        payout_amount=payout_amount,
        expires_at=_parse_expiry_label(expiry),
        state="pending",
    )
    db.add(offer)
    await db.flush()

    execution = Execution(
        id=str(uuid.uuid4()),
        shop_id=shop.id,
        deal_offer_id=offer.id,
        tx_hash=None,
        payout_sent_wei=None,
        tokens_received=str(negotiation.input_amount),
        state="pending",
        error_message=None,
    )
    db.add(execution)
    await db.flush()

    try:
        if simulate_only:
            tx_hash, execution_state, payout_sent_wei = _simulate_eth_settlement(seller, payout_amount, negotiation.id)
        else:
            tx_hash, execution_state, payout_sent_wei = _submit_eth_settlement(shop, seller, payout_amount)
    except SettlementError as exc:
        offer.state = "failed"
        execution.state = "failed"
        execution.error_message = str(exc)
        negotiation.error_message = str(exc)
        await db.flush()
        await db.refresh(offer)
        await db.refresh(execution)
        await db.refresh(negotiation)
        raise

    offer.state = execution_state
    execution.tx_hash = tx_hash
    execution.payout_sent_wei = payout_sent_wei
    execution.state = execution_state
    execution.error_message = None

    negotiation.settled = True
    negotiation.agreed_payout = payout_amount
    negotiation.outcome = "accepted"
    negotiation.quote_status = "accepted"
    negotiation.error_message = None

    await db.flush()
    await db.refresh(offer)
    await db.refresh(execution)
    await db.refresh(negotiation)
    return offer, execution, negotiation
