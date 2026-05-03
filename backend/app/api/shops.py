"""Shop API routes — CRUD for pawn shop instances."""

import uuid
from typing import Annotated
from decimal import Decimal
from pydantic import BaseModel, Field
from web3 import Web3

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


class CustomTokenAddRequest(BaseModel):
    token_address: Annotated[str, Field(max_length=42, description="ERC-20 token contract address")]


class CustomTokenResponse(BaseModel):
    custom_supported_tokens: list[str]


@router.patch("/{shop_id}/tokens", response_model=CustomTokenResponse)
async def add_custom_token(
    shop_id: str,
    data: CustomTokenAddRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add a custom ERC-20 token address to the shop's allowed token list.

    Validates the address checksum and probes the contract via balanceOf to
    ensure it is a valid ERC-20 contract on the configured chain.
    """
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    token_address = Web3.to_checksum_address(data.token_address)

    # Validate checksum
    if not Web3.is_checksum_address(token_address):
        raise HTTPException(status_code=400, detail="Invalid checksum on token address")

    # Probe the contract with balanceOf (must not revert for a valid ERC-20)
    try:
        from app.services.wallets import AlchemyClient, _alchemy_rpc_url
        client = AlchemyClient(_alchemy_rpc_url())
        w3 = Web3(Web3.HTTPProvider(client.rpc_url))
        erc20_abi = [
            {
                "inputs": [{"name": "account", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
        ]
        contract = w3.eth.contract(address=token_address, abi=erc20_abi)
        contract.functions.balanceOf(shop.merchant_address).call()
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Token address does not appear to be a valid ERC-20 contract: {exc}",
        ) from exc

    # Add to list (no duplicates)
    current_tokens: list[str] = shop.custom_supported_tokens or []
    if token_address not in current_tokens:
        current_tokens.append(token_address)
    shop.custom_supported_tokens = current_tokens
    await db.flush()

    return CustomTokenResponse(custom_supported_tokens=shop.custom_supported_tokens)


@router.delete("/{shop_id}/tokens/{token_address}", response_model=CustomTokenResponse)
async def remove_custom_token(
    shop_id: str,
    token_address: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove a custom ERC-20 token address from the shop's allowed token list."""
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    checksum_address = Web3.to_checksum_address(token_address)
    current_tokens: list[str] = shop.custom_supported_tokens or []
    if checksum_address in current_tokens:
        current_tokens.remove(checksum_address)
    shop.custom_supported_tokens = current_tokens
    await db.flush()

    return CustomTokenResponse(custom_supported_tokens=shop.custom_supported_tokens)


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


@router.get("/{shop_id}/wallet/debug")
async def debug_wallet_balances(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Debug endpoint — returns raw on-chain token balances for diagnosis."""
    import logging
    from app.services.wallets import AlchemyClient, _alchemy_rpc_url
    from web3 import Web3

    logger = logging.getLogger(__name__)
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    PAWN = "0x621B62fBFe0ABEf52eD2aAfd0787Fb1DAEEed1e5"
    merchant = shop.merchant_address

    # Direct web3 check
    rpc_url = _alchemy_rpc_url()
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(PAWN),
        abi=[{"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}],
    )
    raw_bal = contract.functions.balanceOf(Web3.to_checksum_address(merchant)).call()

    return {
        "shop_id": shop_id,
        "merchant_address": merchant,
        "rpc_url_prefix": rpc_url[:60] + "...",
        "w3_connected": w3.is_connected(),
        "pawn_raw_balance": raw_bal,
        "pawn_tokens": raw_bal / 10**18,
        "alchemy_client_balances": AlchemyClient(rpc_url).get_token_balances(merchant),
    }


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


# fund_contract removed — direct wallet settlement replaces contract escrow
# Keeping the route stub so existing API clients don't break, but it now returns an error.
# If you need wallet top-up functionality, implement a direct wallet-to-address send here.
@router.post("/{shop_id}/fund-contract")
async def fund_contract(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """DEPRECATED — contract escrow is no longer used.

    Settlement now uses direct CDP wallet two-step settlement.
    Fund the merchant wallet directly via /shops/{id}/wallet/withdraw instead.
    """
    raise HTTPException(
        status_code=410,
        detail="fund-contract is deprecated. Settlement uses direct wallet two-step. "
               "Use /shops/{id}/wallet/withdraw to fund the merchant wallet instead."
    )


class FundContractRequest(BaseModel):
    amount_eth: str | None = None


class FundContractResponse(BaseModel):
    pass  # unused, kept for schema compatibility


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
