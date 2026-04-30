"""Shop and ShopEnsIdentity models."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.provider_key import ProviderKey
    from app.models.negotiation import NegotiationSession
    from app.models.deal import DealOffer, Execution


class ShopStatus(str):
    DRAFT = "draft"
    PUBLISHED = "published"
    PAUSED = "paused"
    CLOSED = "closed"


class Shop(Base):
    """A merchant's pawn shop. Identified by ENS name and owner wallet."""

    __tablename__ = "shops"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    owner_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    # Primary ENS identity for this shop
    ens_name: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    # Human-readable shop name
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    # Short tagline / description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Plain-language merchant behavior fields for the owner-facing setup UI
    merchant_persona: Mapped[str | None] = mapped_column(Text, nullable=True)
    buying_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    pricing_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    refusal_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ShopStatus.DRAFT, index=True
    )
    # Base Sepolia contract address for this merchant's settlement
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    # Merchant-configured payout token address (ETH = address(0))
    payout_token: Mapped[str] = mapped_column(
        String(42), nullable=False, default="0x0000000000000000000000000000000000000000"
    )
    # Wallet the merchant uses for signing offers
    merchant_address: Mapped[str] = mapped_column(String(42), nullable=False)
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

    # Relations
    ens_identities: Mapped[list["ShopEnsIdentity"]] = relationship(
        back_populates="shop",
        cascade="all, delete-orphan",
    )
    provider_keys: Mapped[list["ProviderKey"]] = relationship(
        back_populates="shop",
        cascade="all, delete-orphan",
    )
    negotiations: Mapped[list["NegotiationSession"]] = relationship(
        back_populates="shop",
    )
    deals: Mapped[list["DealOffer"]] = relationship(back_populates="shop")
    executions: Mapped[list["Execution"]] = relationship(back_populates="shop")


class ShopEnsIdentity(Base):
    """Additional ENS names or subdomains associated with a shop."""

    __tablename__ = "shop_ens_identities"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    shop_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ens_name: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    # e.g. "subdomain" or "root"
    ens_type: Mapped[str] = mapped_column(String(32), nullable=False, default="subdomain")
    is_primary: Mapped[bool] = mapped_column(default=False)
    resolver_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    shop: Mapped["Shop"] = relationship(back_populates="ens_identities")
