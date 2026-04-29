"""ProviderKey Pydantic schemas."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class ProviderKeyCreate(BaseModel):
    provider: Annotated[
        str,
        Field(
            description="Provider name: openai | anthropic | openrouter",
            pattern="^(openai|anthropic|openrouter)$",
        ),
    ]
    encrypted_key: Annotated[str, Field(description="Encrypted API key blob stored in the DB")]
    model: Annotated[str | None, Field(max_length=64, description="Optional model identifier, e.g. gpt-4o")] = None
    label: Annotated[str | None, Field(max_length=64, description="Merchant label, e.g. production")] = None


class ProviderKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shop_id: str
    provider: str
    model: str | None
    label: str | None
    is_active: bool
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Never return encrypted_key in API responses
