"""Quote acceptance and settlement orchestration."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deal import DealOffer, Execution
from app.models.negotiation import NegotiationSession
from app.models.shop import Shop, ShopWalletStatus
from app.services.wallets import ZERO_ADDRESS


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


def _simulated_tx_hash(seed: str) -> str:
    return "0x" + hashlib.sha256(f"tx:{seed}".encode()).hexdigest()


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

    if (
        shop.wallet_status != ShopWalletStatus.ACTIVE
        or not shop.merchant_address
        or shop.merchant_address == ZERO_ADDRESS
    ):
        raise SettlementError("Merchant wallet is not active. Provision the merchant wallet before accepting quotes.")

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
        state="executed",
    )
    db.add(offer)
    await db.flush()

    execution = Execution(
        id=str(uuid.uuid4()),
        shop_id=shop.id,
        deal_offer_id=offer.id,
        tx_hash=_simulated_tx_hash(chain_deal_id),
        payout_sent_wei=payout_amount,
        tokens_received=str(negotiation.input_amount),
        state="confirmed",
        error_message=None,
    )
    db.add(execution)

    negotiation.settled = True
    negotiation.agreed_payout = payout_amount
    negotiation.outcome = "accepted"
    negotiation.quote_status = "accepted"

    await db.flush()
    await db.refresh(offer)
    await db.refresh(execution)
    await db.refresh(negotiation)
    return offer, execution, negotiation
