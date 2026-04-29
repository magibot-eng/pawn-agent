"""Deal and Execution API routes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.deal import DealOffer, Execution
from app.schemas.deal import (
    DealOfferCreate,
    DealOfferUpdate,
    DealOfferResponse,
    ExecutionResponse,
)

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
