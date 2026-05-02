"""Negotiation session API routes."""

import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.negotiation import NegotiationSession
from app.schemas.deal import DealOfferResponse, ExecutionResponse
from app.schemas.negotiation import (
    NegotiationSessionCreate,
    NegotiationSessionUpdate,
    NegotiationSessionResponse,
)
from app.services.negotiations import process_seller_message
from app.services.settlements import accept_quote_and_execute, SettlementError

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

    # Handle accept_quote action — route to the existing settlement logic
    if data.action == "accept_quote":
        # Reject if other fields are also being set (avoid ambiguity)
        other_fields = [
            data.chat_log_entry,
            data.outcome,
            data.agreed_payout,
            data.settled,
            data.error_message,
            data.negotiation_state,
        ]
        if any(f is not None for f in other_fields):
            raise HTTPException(
                status_code=400,
                detail="When action=accept_quote is set, no other fields may be provided.",
            )
        if not data.payout_token or not data.payout_amount or not data.expiry:
            raise HTTPException(
                status_code=400,
                detail="action=accept_quote requires payout_token, payout_amount, and expiry.",
            )
        try:
            _, _, negotiation = await accept_quote_and_execute(
                negotiation_id=negotiation_id,
                payout_token=data.payout_token,
                payout_amount=data.payout_amount,
                expiry=data.expiry,
                db=db,
            )
        except SettlementError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await db.refresh(negotiation)
        return negotiation

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
    quote: dict | None = None


class AcceptQuoteRequest(BaseModel):
    payout_token: Annotated[str, Field(max_length=42, description="Merchant payout token for the accepted quote")]
    payout_amount: Annotated[str, Field(max_length=78, description="Accepted payout amount")]
    expiry: Annotated[str, Field(max_length=64, description="Quote expiry label or timestamp")]


class AcceptQuoteResponse(BaseModel):
    success: bool
    deal_offer: DealOfferResponse
    execution: ExecutionResponse
    negotiation: NegotiationSessionResponse


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


@router.post("/{negotiation_id}/accept", response_model=AcceptQuoteResponse)
async def accept_quote(
    negotiation_id: str,
    data: AcceptQuoteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Accept the current quote and create execution records using the merchant wallet path."""
    try:
        offer, execution, negotiation = await accept_quote_and_execute(
            negotiation_id=negotiation_id,
            payout_token=data.payout_token,
            payout_amount=data.payout_amount,
            expiry=data.expiry,
            db=db,
        )
    except SettlementError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # Graceful fallback: return JSON error with success=False instead of 500.
        # Catches any unexpected exception (AttributeError, KeyError, network errors, etc.)
        return JSONResponse(
            status_code=200,
            content={"success": False, "error": str(exc)},
        )

    return AcceptQuoteResponse(
        success=True,
        deal_offer=DealOfferResponse.model_validate(offer),
        execution=ExecutionResponse.model_validate(execution),
        negotiation=NegotiationSessionResponse.model_validate(negotiation),
    )
