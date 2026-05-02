"""Shop API routes — CRUD for pawn shop instances."""

import uuid
from typing import Annotated
from decimal import Decimal, InvalidOperation
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models.deal import DealOffer
from app.models.shop import Shop, ShopStatus, ShopEnsIdentity, ShopWalletStatus
from app.schemas.shop import (
    ShopCreate,
    ShopUpdate,
    ShopResponse,
    ShopEnsIdentityCreate,
    ShopEnsIdentityResponse,
    ShopWalletStatusResponse,
    ShopWalletWithdrawRequest,
    ShopWalletTransferResponse,
)
from app.services.ens import verify_ens_route
from app.services.wallets import (
    provision_managed_wallet,
    get_wallet_status_details,
    withdraw_eth_to_owner,
    WalletProvisioningError,
    AlchemyClient,
    _alchemy_rpc_url,
    _decrypt_privkey,
)
from app.config import get_settings

BUYOUT_CONTRACT_ADDRESS = "0x754e37A77c177B92873e3057e5884dc6D0c0C4CE"
BASE_SEPOLIA_CHAIN_ID = 84532

router = APIRouter(prefix="/shops", tags=["shops"])


def _normalize_ens_name(ens_name: str) -> str:
    return ens_name.strip().lower()


def _normalize_address(address: str) -> str:
    return address.strip().lower()


def _validate_verified_owner_match(owner_address: str, verified_owner_address: str | None) -> str | None:
    if not verified_owner_address:
        raise HTTPException(status_code=400, detail="A verified ENS route must include a verified owner address")
    if _normalize_address(verified_owner_address) != _normalize_address(owner_address):
        raise HTTPException(status_code=400, detail="A verified ENS owner address must match the shop owner wallet")
    return verified_owner_address


async def _ensure_ens_route_available(
    db: AsyncSession,
    ens_name: str,
    *,
    current_shop_id: str | None = None,
) -> None:
    result = await db.execute(select(Shop).where(Shop.ens_name == ens_name))
    existing_shop = result.scalar_one_or_none()
    if existing_shop and existing_shop.id != current_shop_id:
        raise HTTPException(status_code=409, detail=f"ENS route {ens_name} is already claimed by another shop")


@router.post("", response_model=ShopResponse, status_code=status.HTTP_201_CREATED)
async def create_shop(
    data: ShopCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new pawn shop for a merchant ENS identity."""
    normalized_ens_name = _normalize_ens_name(data.ens_name)
    ens_verification = await verify_ens_route(normalized_ens_name, data.owner_address)
    if ens_verification.status == "verified":
        normalized_verified_owner_address = _validate_verified_owner_match(data.owner_address, ens_verification.verified_owner_address)
        normalized_verification_status = "verified"
    else:
        normalized_verification_status = "manual"
        normalized_verified_owner_address = None
    await _ensure_ens_route_available(db, normalized_ens_name)

    shop = Shop(
        id=str(uuid.uuid4()),
        owner_address=data.owner_address,
        ens_name=normalized_ens_name,
        display_name=data.display_name,
        description=data.description,
        merchant_persona=data.merchant_persona,
        buying_preferences=data.buying_preferences,
        pricing_style=data.pricing_style,
        refusal_rules=data.refusal_rules,
        welcome_message=data.welcome_message,
        merchant_portrait=data.merchant_portrait,
        status=ShopStatus.PUBLISHED,
        payout_token=data.payout_token,
        merchant_address=data.merchant_address or "0x0000000000000000000000000000000000000000",
        wallet_provider=data.wallet_provider,
        wallet_provider_account_id=data.wallet_provider_account_id,
        wallet_status=data.wallet_status or ShopWalletStatus.PENDING,
        auto_settlement_enabled=data.auto_settlement_enabled,
        ens_verification_status=normalized_verification_status,
        ens_verified_owner_address=normalized_verified_owner_address,
    )
    db.add(shop)
    await db.flush()
    # Eager-load ens_identities for response serialization
    result = await db.execute(
        select(Shop).where(Shop.id == shop.id).options(selectinload(Shop.ens_identities))
    )
    shop = result.scalar_one()
    return shop


@router.get("", response_model=list[ShopResponse])
async def list_shops(
    db: Annotated[AsyncSession, Depends(get_db)],
    owner_address: str | None = None,
    ens_name: str | None = None,
    status: str | None = None,
):
    """List shops, optionally filtered by owner address, ENS name, or status."""
    query = select(Shop)
    if owner_address:
        query = query.where(Shop.owner_address == owner_address)
    if ens_name:
        query = query.where(Shop.ens_name == ens_name)
    if status:
        query = query.where(Shop.status == status)
    query = query.options(selectinload(Shop.ens_identities)).order_by(Shop.created_at.desc())

    result = await db.execute(query)
    shops = result.scalars().all()
    return shops


@router.get("/{shop_id}", response_model=ShopResponse)
async def get_shop(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single shop by ID."""
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id).options(selectinload(Shop.ens_identities))
    )
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop


@router.patch("/{shop_id}", response_model=ShopResponse)
async def update_shop(
    shop_id: str,
    data: ShopUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update shop fields (status, display name, payout token, etc.)."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    updates = data.model_dump(exclude_unset=True)

    next_ens_name = _normalize_ens_name(updates.get("ens_name", shop.ens_name))
    await _ensure_ens_route_available(db, next_ens_name, current_shop_id=shop.id)

    if "ens_name" in updates:
        ens_verification = await verify_ens_route(next_ens_name, shop.owner_address)
        if ens_verification.status == "verified":
            next_verification_status = "verified"
            next_verified_owner_address = _validate_verified_owner_match(shop.owner_address, ens_verification.verified_owner_address)
        else:
            next_verification_status = "manual"
            next_verified_owner_address = None
    else:
        next_verification_status = shop.ens_verification_status
        next_verified_owner_address = shop.ens_verified_owner_address

    updates.pop("ens_verification_status", None)
    updates.pop("ens_verified_owner_address", None)

    for field, value in updates.items():
        setattr(shop, field, value)

    shop.ens_name = next_ens_name
    shop.ens_verification_status = next_verification_status
    shop.ens_verified_owner_address = next_verified_owner_address

    await db.flush()
    # Eager-load ens_identities for response serialization
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id).options(selectinload(Shop.ens_identities))
    )
    shop = result.scalar_one()
    return shop


@router.post("/{shop_id}/wallet/provision", response_model=ShopResponse)
async def provision_shop_wallet(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Provision the managed merchant wallet for a shop.

    For now this uses a deterministic CDP-style stub so the product flow can be
    exercised before live wallet credentials are wired in.
    """
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    try:
        await provision_managed_wallet(shop)
    except (ValueError, WalletProvisioningError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.flush()
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id).options(selectinload(Shop.ens_identities))
    )
    shop = result.scalar_one()
    return shop


@router.get("/{shop_id}/wallet/status", response_model=ShopWalletStatusResponse)
async def get_shop_wallet_status(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return read-only merchant wallet status details for the owner UI."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    details = await get_wallet_status_details(shop)
    return ShopWalletStatusResponse(**details.__dict__)


@router.post("/{shop_id}/wallet/withdraw", response_model=ShopWalletTransferResponse)
async def withdraw_shop_wallet_to_owner(
    shop_id: str,
    data: ShopWalletWithdrawRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send ETH from the live merchant wallet back to the owner wallet."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    try:
        transfer = await withdraw_eth_to_owner(shop, data.amount_eth)
    except WalletProvisioningError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ShopWalletTransferResponse(
        success=True,
        recipient_address=transfer.recipient_address,
        amount_eth=transfer.amount_eth,
        amount_wei=transfer.amount_wei,
        state=transfer.state,
        tx_hash=transfer.tx_hash,
    )


# ---------------------------------------------------------------------------


BUYOUT_CONTRACT_ADDRESS = "0x754e37A77c177B92873e3057e5884dc6D0c0C4CE"
BASE_SEPOLIA_CHAIN_ID = 84532


class FundContractRequest(BaseModel):
    amount_eth: str = Field(default="0.01", description="ETH amount to fund the contract with")


class FundContractResponse(BaseModel):
    tx_hash: str
    contract_balance_eth: str
    warning: str | None = None


@router.post("/{shop_id}/fund-contract", response_model=FundContractResponse)
async def fund_contract(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    data: FundContractRequest = FundContractRequest(),
):
    """Send ETH from the merchant wallet to the BuyoutSettlement contract.

    The merchant wallet must be live-provisioned (alchemy_live_ mode).
    After funding, checks if the contract balance covers all pending deal payouts
    and returns a warning if not.
    """
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    settings = get_settings()

    if not settings.cdp_wallet_live_enabled:
        raise HTTPException(status_code=400, detail="Live wallet mode is not enabled. Set CDP_WALLET_LIVE_ENABLED=true.")
    if not shop.wallet_provider_account_id or not shop.wallet_provider_account_id.startswith("alchemy_live_"):
        raise HTTPException(status_code=400, detail="Shop wallet is not live-provisioned. Provision a live wallet first.")
    if not shop.wallet_encrypted_key:
        raise HTTPException(status_code=400, detail="Merchant wallet private key not found. Re-provision the wallet.")

    privkey = _decrypt_privkey(shop.wallet_encrypted_key, settings.master_encryption_key)

    # Parse amount
    try:
        decimal_amount = Decimal(data.amount_eth)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid ETH amount: {data.amount_eth}")
    if decimal_amount <= 0:
        raise HTTPException(status_code=400, detail="ETH amount must be greater than zero.")
    amount_wei = int(decimal_amount * Decimal("1e18"))

    contract_address = settings.buyout_contract_address or BUYOUT_CONTRACT_ADDRESS

    # Send ETH to contract via AlchemyClient
    client = AlchemyClient(_alchemy_rpc_url())
    tx_hash, _ = client.send_eth(privkey, contract_address, amount_wei)

    # Check contract balance after funding
    contract_balance_wei, _ = client.get_eth_balance(contract_address)
    contract_balance_eth = (
        str(Decimal(contract_balance_wei) / Decimal("1e18")) if contract_balance_wei else "0"
    )

    # Check if contract can cover all pending deals
    warning = None
    if contract_balance_wei:
        pending_result = await db.execute(
            select(DealOffer).where(
                DealOffer.shop_id == shop_id,
                DealOffer.state.in_(["pending", "pending_owner_review"]),
            )
        )
        pending_deals = pending_result.scalars().all()
        total_pending_wei = sum(
            int(str(d.payout_amount)) for d in pending_deals if d.payout_amount
        )
        if int(contract_balance_wei) < total_pending_wei:
            warning = (
                f"Contract balance ({contract_balance_eth} ETH) is less than total pending "
                f"payouts ({Decimal(str(total_pending_wei)) / Decimal('1e18')} ETH). "
                "Top up the contract before executing pending deals."
            )

    return FundContractResponse(
        tx_hash=tx_hash,
        contract_balance_eth=contract_balance_eth,
        warning=warning,
    )


# ---------------------------------------------------------------------------
# ENS Identity sub-resources
# ---------------------------------------------------------------------------


@router.post("/{shop_id}/ens-identities", response_model=ShopEnsIdentityResponse, status_code=201)
async def add_ens_identity(
    shop_id: str,
    data: ShopEnsIdentityCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add an ENS name or subdomain to a shop."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    identity = ShopEnsIdentity(
        id=str(uuid.uuid4()),
        shop_id=shop_id,
        ens_name=data.ens_name,
        ens_type=data.ens_type,
        is_primary=data.is_primary,
        resolver_address=data.resolver_address,
    )
    db.add(identity)
    await db.flush()
    await db.refresh(identity)
    return identity


@router.get("/{shop_id}/ens-identities", response_model=list[ShopEnsIdentityResponse])
async def list_ens_identities(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all ENS identities for a shop."""
    result = await db.execute(
        select(ShopEnsIdentity).where(ShopEnsIdentity.shop_id == shop_id)
    )
    return result.scalars().all()
