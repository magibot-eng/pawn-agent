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

    chat_log_entry: dict | None = Field(
        default=None,
        description="A single chat log entry: {sender: 'merchant'|'seller', text: '...', timestamp: 'ISO8601'}",
    )
    outcome: Annotated[str | None, Field(max_length=32, description="e.g. settled, rejected, expired, cancelled")] = None
    agreed_payout: Annotated[str | None, Field(max_length=78, description="Final payout amount in wei, set on settlement")] = None
    settled: bool | None = None
    error_message: str | None = None


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
    agreed_payout: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
