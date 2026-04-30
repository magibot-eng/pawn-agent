"""Shop and ShopEnsIdentity Pydantic schemas."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# ShopEnsIdentity schemas
# ---------------------------------------------------------------------------


class ShopEnsIdentityCreate(BaseModel):
    ens_name: Annotated[str, Field(max_length=256, description="ENS name or subdomain")]
    ens_type: Annotated[str, Field(max_length=32, default="subdomain", description="subdomain or root")]
    is_primary: bool = False
    resolver_address: Annotated[str | None, Field(max_length=42, description="Optional ENS resolver address")] = None


class ShopEnsIdentityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shop_id: str
    ens_name: str
    ens_type: str
    is_primary: bool
    resolver_address: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Shop schemas
# ---------------------------------------------------------------------------


class ShopCreate(BaseModel):
    owner_address: Annotated[str, Field(max_length=42, description="EVM wallet address of shop owner")]
    ens_name: Annotated[str, Field(max_length=256, description="Primary ENS name for this shop")]
    display_name: Annotated[str, Field(max_length=256, description="Human-readable shop name")]
    description: str | None = None
    merchant_persona: str | None = None
    buying_preferences: str | None = None
    pricing_style: str | None = None
    refusal_rules: str | None = None
    welcome_message: str | None = None
    payout_token: Annotated[
        str,
        Field(
            max_length=42,
            default="0x0000000000000000000000000000000000000000",
            description="ERC-20 token address for payouts (ETH = address(0))",
        ),
    ]
    merchant_address: Annotated[str, Field(max_length=42, description="Wallet address used for signing offers")]


class ShopUpdate(BaseModel):
    display_name: Annotated[str | None, Field(max_length=256)] = None
    description: str | None = None
    merchant_persona: str | None = None
    buying_preferences: str | None = None
    pricing_style: str | None = None
    refusal_rules: str | None = None
    welcome_message: str | None = None
    status: str | None = Field(
        default=None,
        description="One of: draft, published, paused, closed",
    )
    payout_token: Annotated[str | None, Field(max_length=42)] = None
    contract_address: Annotated[str | None, Field(max_length=42)] = None


class ShopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_address: str
    ens_name: str
    display_name: str
    description: str | None
    merchant_persona: str | None
    buying_preferences: str | None
    pricing_style: str | None
    refusal_rules: str | None
    welcome_message: str | None
    status: str
    contract_address: str | None
    payout_token: str
    merchant_address: str
    created_at: datetime
    updated_at: datetime
    ens_identities: list[ShopEnsIdentityResponse] = []
