"""DealOffer and Execution models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.shop import Shop
    from app.models.negotiation import NegotiationSession


class DealOffer(Base):
    """An on-chain deal submitted by the merchant for a specific negotiation."""

    __tablename__ = "deal_offers"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    negotiation_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("negotiation_sessions.id", ondelete="SET NULL"), nullable=True
    )
    # keccak256(merchant + nonce) — matches the on-chain dealId
    chain_deal_id: Mapped[str] = mapped_column(String(66), nullable=False, unique=True, index=True)
    # The seller's address on-chain
    seller: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    input_token: Mapped[str] = mapped_column(String(42), nullable=False)
    input_amount: Mapped[str] = mapped_column(String(78), nullable=False)
    payout_amount: Mapped[str] = mapped_column(String(78), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships — use backref for the NegotiationSession side to avoid circular config order.
    shop: Mapped["Shop"] = relationship(back_populates="deals")
    negotiation: Mapped["NegotiationSession"] = relationship(
        backref="deals",
        foreign_keys=[negotiation_id],
    )


class Execution(Base):
    """Record of a completed or failed on-chain settlement."""

    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    deal_offer_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("deal_offers.id", ondelete="CASCADE"), nullable=False
    )
    # On-chain tx hash
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True, index=True)
    # The ETH actually sent in the payout
    payout_sent_wei: Mapped[str | None] = mapped_column(String(78), nullable=True)
    # Tokens actually received (input side of the atomic swap)
    tokens_received: Mapped[str | None] = mapped_column(String(78), nullable=True)
    # The input token address (PAWN or other ERC-20)
    input_token: Mapped[str | None] = mapped_column(String(42), nullable=True)
    # The input token amount in wei
    input_amount: Mapped[str | None] = mapped_column(String(78), nullable=True)
    state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    # On-chain tx hash from the seller's acceptOffer() call that triggered execution
    input_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationship — uses string reference to avoid circular import.
    shop: Mapped["Shop"] = relationship(back_populates="executions")
