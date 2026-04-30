"""Provider key CRUD service — encrypts API keys at rest."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import encrypt, decrypt, EncryptionError
from app.db import get_db
from app.models.provider_key import ProviderKey
from app.schemas.provider_key import ProviderKeyCreate, ProviderKeyResponse


async def save_key(
    shop_id: str,
    data: ProviderKeyCreate,
    db: AsyncSession,
) -> ProviderKey:
    """Encrypt and store a provider API key for a shop."""
    try:
        encrypted_blob = encrypt(data.encrypted_key)
    except EncryptionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    result = await db.execute(
        select(ProviderKey).where(ProviderKey.shop_id == shop_id, ProviderKey.is_active == True)
    )
    for existing_key in result.scalars().all():
        existing_key.is_active = False

    key = ProviderKey(
        id=str(uuid.uuid4()),
        shop_id=shop_id,
        provider=data.provider,
        encrypted_key=encrypted_blob,
        model=data.model,
        label=data.label,
    )
    db.add(key)
    await db.flush()
    await db.refresh(key)
    return key


async def get_keys_for_shop(
    shop_id: str,
    db: AsyncSession,
) -> list[ProviderKey]:
    """List all stored keys for a shop (returns no plaintext)."""
    result = await db.execute(
        select(ProviderKey).where(ProviderKey.shop_id == shop_id)
    )
    return list(result.scalars().all())


async def decrypt_key(key_id: str, db: AsyncSession) -> str:
    """Decrypt and return the plaintext API key (internal use only)."""
    result = await db.execute(select(ProviderKey).where(ProviderKey.id == key_id))
    key = result.scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail="Provider key not found")

    try:
        return decrypt(key.encrypted_key)
    except EncryptionError as e:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {e}")
