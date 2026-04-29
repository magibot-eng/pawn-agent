"""Shop API routes — CRUD for pawn shop instances."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.shop import Shop, ShopStatus
from app.schemas.shop import (
    ShopCreate,
    ShopUpdate,
    ShopResponse,
    ShopEnsIdentityCreate,
    ShopEnsIdentityResponse,
)

router = APIRouter(prefix="/shops", tags=["shops"])


@router.post("", response_model=ShopResponse, status_code=status.HTTP_201_CREATED)
async def create_shop(
    data: ShopCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new pawn shop for a merchant ENS identity."""
    shop = Shop(
        id=str(uuid.uuid4()),
        owner_address=data.owner_address,
        ens_name=data.ens_name,
        display_name=data.display_name,
        description=data.description,
        payout_token=data.payout_token,
        merchant_address=data.merchant_address,
    )
    db.add(shop)
    await db.flush()
    await db.refresh(shop)
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
    query = query.order_by(Shop.created_at.desc())

    result = await db.execute(query)
    shops = result.scalars().all()
    return shops


@router.get("/{shop_id}", response_model=ShopResponse)
async def get_shop(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single shop by ID."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
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

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)

    await db.flush()
    await db.refresh(shop)
    return shop


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
