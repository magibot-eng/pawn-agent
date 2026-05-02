"""Deal and Execution API routes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.deal import DealOffer, Execution
from app.models.shop import Shop
from app.schemas.deal import (
    DealOfferCreate,
    DealOfferUpdate,
    DealOfferResponse,
    ExecutionResponse,
)

from app.services.settlements import _submit_eth_settlement, poll_offer_accepted, SettlementError

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("/offers", response_model=DealOfferResponse, status_code=status.HTTP_201_CREATED)
async def create_deal_offer(
    data: DealOfferCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create (register) a new deal offer on a shop."""
    offer = DealOffer(
        id=str(uuid.uuid4()),
        shop_id=data.shop_id,
        negotiation_id=data.negotiation_id,
        chain_deal_id=data.chain_deal_id,
        seller=data.seller,
        input_token=data.input_token,
        input_amount=data.input_amount,
        payout_amount=data.payout_amount,
        expires_at=data.expires_at,
    )
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return offer


@router.get("/offers/{offer_id}", response_model=DealOfferResponse)
async def get_deal_offer(
    offer_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a deal offer by ID."""
    result = await db.execute(select(DealOffer).where(DealOffer.id == offer_id))
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Deal offer not found")
    return offer


@router.patch("/offers/{offer_id}", response_model=DealOfferResponse)
async def update_deal_offer(
    offer_id: str,
    data: DealOfferUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a deal offer's state (executed, cancelled, expired)."""
    result = await db.execute(select(DealOffer).where(DealOffer.id == offer_id))
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Deal offer not found")

    if data.state is not None:
        offer.state = data.state

    await db.flush()
    await db.refresh(offer)
    return offer


@router.get("/offers/by-shop/{shop_id}", response_model=list[DealOfferResponse])
async def list_deal_offers_by_shop(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    state: str | None = None,
):
    """List deal offers for a shop, optionally filtered by state."""
    query = select(DealOffer).where(DealOffer.shop_id == shop_id)
    if state:
        query = query.where(DealOffer.state == state)
    query = query.order_by(DealOffer.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/offers/by-chain-deal-id/{chain_deal_id}", response_model=DealOfferResponse)
async def get_deal_by_chain_id(
    chain_deal_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Look up a deal offer by its on-chain deal ID (keccak256 hash)."""
    result = await db.execute(
        select(DealOffer).where(DealOffer.chain_deal_id == chain_deal_id)
    )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Deal offer not found")
    return offer


# ---------------------------------------------------------------------------
# Executions
# ---------------------------------------------------------------------------


@router.get("/executions/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get an execution record by ID."""
    result = await db.execute(select(Execution).where(Execution.id == execution_id))
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.get("/executions/by-offer/{offer_id}", response_model=list[ExecutionResponse])
async def list_executions_by_offer(
    offer_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all execution attempts for a deal offer."""
    result = await db.execute(
        select(Execution).where(Execution.deal_offer_id == offer_id)
    )
    return result.scalars().all()


@router.post("/offers/{offer_id}/settle", response_model=ExecutionResponse)
async def settle_pending_deal(
    offer_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Trigger real ETH settlement for a deal stuck in pending_review state."""
    result = await db.execute(select(DealOffer).where(DealOffer.id == offer_id))
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Deal offer not found")
    if offer.state != "pending_review":
        raise HTTPException(status_code=400, detail=f"Deal is {offer.state}, not pending_review.")

    # Look up the shop
    result2 = await db.execute(select(Shop).where(Shop.id == offer.shop_id))
    shop = result2.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Find the execution record
    result3 = await db.execute(select(Execution).where(Execution.deal_offer_id == offer_id))
    execution = result3.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="No execution record found.")

    try:
        tx_hash, execution_state, payout_sent_wei = _submit_eth_settlement(
            shop, offer.seller, offer.payout_amount
        )
        execution.tx_hash = tx_hash
        execution.payout_sent_wei = payout_sent_wei
        execution.state = execution_state
        execution.error_message = None
        offer.state = execution_state
        await db.flush()
        await db.refresh(execution)
        await db.refresh(offer)
        return execution
    except SettlementError as exc:
        execution.state = "failed"
        execution.error_message = str(exc)
        await db.flush()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/executions/pending", response_model=list[ExecutionResponse])
async def get_pending_executions(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Poll for OfferAccepted events from BuyoutSettlement and return updated Execution records.

    Calls poll_offer_accepted() to check for recent on-chain OfferAccepted events
    for this shop. Any Executions whose deals were accepted on-chain are updated
    to state=\"executed\" with the input_tx_hash set.
    """
    try:
        updated = await poll_offer_accepted(shop_id, db)
        return updated
    except SettlementError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
