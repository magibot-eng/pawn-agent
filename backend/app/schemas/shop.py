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
    merchant_address: Annotated[
        str | None,
        Field(
            max_length=42,
            default=None,
            description="Optional managed merchant wallet address. Omit during initial shop creation to leave wallet unprovisioned.",
        ),
    ] = None
    wallet_provider: Annotated[
        str,
        Field(
            max_length=32,
            default="cdp_agentic_wallet",
            description="Managed wallet provider for the merchant agent.",
        ),
    ]
    wallet_provider_account_id: Annotated[
        str | None,
        Field(max_length=128, default=None, description="Provider-side merchant wallet/account id, if already provisioned."),
    ] = None
    wallet_status: Annotated[
        str,
        Field(
            max_length=16,
            default="pending",
            description="Merchant wallet lifecycle state: pending, active, paused, error.",
        ),
    ]
    auto_settlement_enabled: bool = False


class ShopUpdate(BaseModel):
    ens_name: Annotated[str | None, Field(max_length=256)] = None
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
    merchant_address: Annotated[str | None, Field(max_length=42)] = None
    wallet_provider: Annotated[str | None, Field(max_length=32)] = None
    wallet_provider_account_id: Annotated[str | None, Field(max_length=128)] = None
    wallet_status: Annotated[str | None, Field(max_length=16)] = None
    auto_settlement_enabled: bool | None = None


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
    wallet_provider: str
    wallet_provider_account_id: str | None
    wallet_status: str
    auto_settlement_enabled: bool
    created_at: datetime
    updated_at: datetime
    ens_identities: list[ShopEnsIdentityResponse] = []


class ShopWalletStatusResponse(BaseModel):
    wallet_provider: str
    wallet_status: str
    merchant_address: str
    wallet_provider_account_id: str | None
    provisioning_mode: str
    authenticated: bool
    authenticated_email: str | None
    balance: str | None
    balance_symbol: str | None


class ShopWalletWithdrawRequest(BaseModel):
    amount_eth: Annotated[str, Field(max_length=78, description="ETH amount to withdraw from merchant wallet to owner wallet")]


class ShopWalletTransferResponse(BaseModel):
    success: bool
    recipient_address: str
    amount_eth: str
    amount_wei: str
    state: str
    tx_hash: str
