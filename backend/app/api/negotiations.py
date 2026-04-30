"""Negotiation session API routes."""

import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.negotiation import NegotiationSession
from app.schemas.negotiation import (
    NegotiationSessionCreate,
    NegotiationSessionUpdate,
    NegotiationSessionResponse,
)
from app.services.negotiations import process_seller_message

router = APIRouter(prefix="/negotiations", tags=["negotiations"])


@router.post("", response_model=NegotiationSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_negotiation(
    data: NegotiationSessionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Start a new negotiation session between a seller and a shop."""
    negotiation = NegotiationSession(
        id=str(uuid.uuid4()),
        shop_id=data.shop_id,
        seller_address=data.seller_address,
        input_token=data.input_token,
        input_amount=data.input_amount,
    )
    db.add(negotiation)
    await db.flush()
    await db.refresh(negotiation)
    return negotiation


@router.get("/{negotiation_id}", response_model=NegotiationSessionResponse)
async def get_negotiation(
    negotiation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a negotiation session by ID."""
    result = await db.execute(
        select(NegotiationSession).where(NegotiationSession.id == negotiation_id)
    )
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise HTTPException(status_code=404, detail="Negotiation not found")
    return negotiation


@router.patch("/{negotiation_id}", response_model=NegotiationSessionResponse)
async def update_negotiation(
    negotiation_id: str,
    data: NegotiationSessionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Append a chat message or update settlement/outcome state."""
    result = await db.execute(
        select(NegotiationSession).where(NegotiationSession.id == negotiation_id)
    )
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise HTTPException(status_code=404, detail="Negotiation not found")

    if data.chat_log_entry:
        log = json.loads(negotiation.chat_log or "[]")
        log.append(data.chat_log_entry)
        negotiation.chat_log = json.dumps(log, default=str)

    if data.outcome is not None:
        negotiation.outcome = data.outcome
    if data.agreed_payout is not None:
        negotiation.agreed_payout = data.agreed_payout
    if data.settled is not None:
        negotiation.settled = data.settled
    if data.error_message is not None:
        negotiation.error_message = data.error_message

    await db.flush()
    await db.refresh(negotiation)
    return negotiation


@router.get("/by-shop/{shop_id}", response_model=list[NegotiationSessionResponse])
async def list_negotiations_by_shop(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    settled: bool | None = None,
):
    """List all negotiations for a shop, optionally filtered by settled state."""
    query = select(NegotiationSession).where(NegotiationSession.shop_id == shop_id)
    if settled is not None:
        query = query.where(NegotiationSession.settled == settled)
    query = query.order_by(NegotiationSession.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


class ChatRequest(BaseModel):
    message: Annotated[str, Field(max_length=1000, description="Seller's message to the merchant")]


class ChatResponse(BaseModel):
    merchant_response: str
    success: bool
    error: str | None = None
    response_mode: str | None = None
    provider: str | None = None
    model: str | None = None
    used_fallback: bool = False
    negotiation_state: dict[str, str] | None = None


@router.post("/{negotiation_id}/chat", response_model=ChatResponse)
async def chat(
    negotiation_id: str,
    data: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a message from the seller and receive the merchant AI response."""
    result = await db.execute(
        select(NegotiationSession).where(NegotiationSession.id == negotiation_id)
    )
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise HTTPException(status_code=404, detail="Negotiation not found")

    outcome = await process_seller_message(negotiation_id, data.message, db)
    return ChatResponse(**outcome)
