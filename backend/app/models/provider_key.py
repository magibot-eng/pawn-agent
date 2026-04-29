"""ProviderKey model — encrypted LLM API credentials stored per shop."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ProviderKey(Base):
    """An encrypted LLM provider API key tied to a shop.

    The plaintext key is encrypted at rest using AES-256-GCM with a master
    key from the PAWN_AGENT_MASTER_ENCRYPTION_KEY environment variable.
    """

    __tablename__ = "provider_keys"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # e.g. "openai", "anthropic", "openrouter"
    provider: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # Encrypted ciphertext blob (hex-encoded)
    encrypted_key: Mapped[str] = mapped_column(Text, nullable=False)
    # For OpenAI: gpt-4o, gpt-4o-mini; for Anthropic: claude-3-5-sonnet, etc.
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Free-text label set by the merchant, e.g. "production", "testing"
    label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # RFC 3339 timestamp of when the key was last used by the agent
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
