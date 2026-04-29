"""DealOffer and Execution Pydantic schemas."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# DealOffer schemas
# ---------------------------------------------------------------------------


class DealOfferCreate(BaseModel):
    shop_id: Annotated[str, Field(max_length=64, description="Shop ID creating this offer")]
    negotiation_id: Annotated[str | None, Field(max_length=64, description="Optional linked negotiation session")] = None
    chain_deal_id: Annotated[str, Field(max_length=66, description="keccak256 hash matching on-chain dealId")]
    seller: Annotated[str, Field(max_length=42, description="Seller's EVM address")]
    input_token: Annotated[str, Field(max_length=42, description="ERC-20 token the seller gives")]
    input_amount: Annotated[str, Field(max_length=78, description="Token amount (string)")]
    payout_amount: Annotated[str, Field(max_length=78, description="ETH payout in wei (string)")]
    expires_at: datetime


class DealOfferUpdate(BaseModel):
    state: Annotated[
        str | None,
        Field(description="New state: pending, executed, cancelled, expired"),
    ] = None


class DealOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shop_id: str
    negotiation_id: str | None
    chain_deal_id: str
    seller: str
    input_token: str
    input_amount: str
    payout_amount: str
    expires_at: datetime
    state: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Execution schemas
# ---------------------------------------------------------------------------


class ExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shop_id: str
    deal_offer_id: str
    tx_hash: str | None
    payout_sent_wei: str | None
    tokens_received: str | None
    state: str
    error_message: str | None
    created_at: datetime
