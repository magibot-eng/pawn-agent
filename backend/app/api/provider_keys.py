"""Provider key management API — keys are encrypted at rest."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.provider_key import ProviderKeyCreate, ProviderKeyResponse, ProviderKeyTestResponse
from app.services.provider_keys import save_key, get_keys_for_shop, test_active_key

router = APIRouter(prefix="/shops/{shop_id}/provider-keys", tags=["provider-keys"])


@router.post("", response_model=ProviderKeyResponse, status_code=status.HTTP_201_CREATED)
async def add_provider_key(
    shop_id: str,
    data: ProviderKeyCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Store an encrypted API key for a provider (OpenAI / Anthropic / OpenRouter)."""
    key = await save_key(shop_id, data, db)
    return key


@router.get("", response_model=list[ProviderKeyResponse])
async def list_provider_keys(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all stored provider keys for a shop (plaintext never returned)."""
    return await get_keys_for_shop(shop_id, db)


@router.post("/test-active", response_model=ProviderKeyTestResponse)
async def test_active_provider_key(
    shop_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Test the active provider key for a shop with a lightweight probe call."""
    return await test_active_key(shop_id, db)
