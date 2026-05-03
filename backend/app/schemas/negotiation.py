"""NegotiationSession Pydantic schemas."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class NegotiationSessionCreate(BaseModel):
    shop_id: Annotated[str, Field(max_length=64, description="Shop ID this negotiation belongs to")]
    seller_address: Annotated[str, Field(max_length=42, description="Seller's EVM wallet address")]
    input_token: Annotated[str, Field(max_length=42, description="ERC-20 token address the seller wants to offload")]
    input_amount: Annotated[str, Field(max_length=78, description="Amount of input tokens (string to avoid float precision loss)")]


class NegotiationSessionUpdate(BaseModel):
    """Used to append chat messages and update outcome/settlement state."""

    action: Annotated[
        str | None,
        Field(default=None, description="Special action: 'accept_quote' routes to accept_quote_and_execute()"),
    ] = None
    chat_log_entry: dict | None = Field(
        default=None,
        description="A single chat log entry: {sender: 'merchant'|'seller', text: '...', timestamp: 'ISO8601'}",
    )
    outcome: Annotated[str | None, Field(max_length=32, description="e.g. settled, rejected, expired, cancelled")] = None
    negotiation_state: dict[str, str] | None = None
    agreed_payout: Annotated[str | None, Field(max_length=78, description="Final payout amount in wei, set on settlement")] = None
    settled: bool | None = None
    error_message: str | None = None
    # Quote fields needed when action=accept_quote
    payout_token: Annotated[
        str | None,
        Field(default=None, max_length=42, description="Merchant payout token for the accepted quote"),
    ] = None
    payout_amount: Annotated[
        str | None,
        Field(default=None, max_length=78, description="Accepted payout amount"),
    ] = None
    expiry: Annotated[
        str | None,
        Field(default=None, max_length=64, description="Quote expiry label or timestamp"),
    ] = None


class NegotiationSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shop_id: str
    seller_address: str
    input_token: str
    input_amount: str
    settled: bool
    chat_log: str  # JSON string
    outcome: str | None
    negotiation_state: dict[str, str] | None
    agreed_payout: str | None
    error_message: str | None
    # Quote state fields (exposed for frontend quote display)
    quote_status: str | None = None
    seller_ask_token: str | None = None
    seller_ask_amount: str | None = None
    seller_ask_price: str | None = None
    merchant_quote_token: str | None = None
    merchant_quote_amount: str | None = None
    merchant_quote_expiry: str | None = None
    # Presence of an active provider key — set by GET endpoint so frontend knows at load time
    has_provider_key: bool = False
    created_at: datetime
    updated_at: datetime
