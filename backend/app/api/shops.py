"""Shop API routes — CRUD for pawn shop instances."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
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
from app.services.wallets import provision_managed_wallet, get_wallet_status_details, withdraw_eth_to_owner, WalletProvisioningError

router = APIRouter(prefix="/shops", tags=["shops"])


def _normalize_ens_name(ens_name: str) -> str:
    return ens_name.strip().lower()


def _normalize_address(address: str) -> str:
    return address.strip().lower()


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


def _validate_ens_verification(owner_address: str, verification_status: str | None, verified_owner_address: str | None) -> tuple[str, str | None]:
    normalized_status = (verification_status or "manual").strip().lower()
    if normalized_status == "verified":
        if not verified_owner_address:
            raise HTTPException(status_code=400, detail="A verified ENS route must include a verified owner address")
        if _normalize_address(verified_owner_address) != _normalize_address(owner_address):
            raise HTTPException(status_code=400, detail="A verified ENS owner address must match the shop owner wallet")
        return normalized_status, verified_owner_address
    return "manual", None


@router.post("", response_model=ShopResponse, status_code=status.HTTP_201_CREATED)
async def create_shop(
    data: ShopCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new pawn shop for a merchant ENS identity."""
    normalized_ens_name = _normalize_ens_name(data.ens_name)
    normalized_verification_status, normalized_verified_owner_address = _validate_ens_verification(
        owner_address=data.owner_address,
        verification_status=data.ens_verification_status,
        verified_owner_address=data.ens_verified_owner_address,
    )
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
    next_verification_status, next_verified_owner_address = _validate_ens_verification(
        owner_address=shop.owner_address,
        verification_status=updates.get("ens_verification_status", shop.ens_verification_status),
        verified_owner_address=updates.get("ens_verified_owner_address", shop.ens_verified_owner_address),
    )
    await _ensure_ens_route_available(db, next_ens_name, current_shop_id=shop.id)

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
    except ValueError as exc:
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

    details = get_wallet_status_details(shop)
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
