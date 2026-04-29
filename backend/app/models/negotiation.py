"""NegotiationSession model — tracks a seller's conversation with a merchant."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.shop import Shop


class NegotiationSession(Base):
    """A live or completed negotiation between a seller and a merchant's AI agent."""

    __tablename__ = "negotiation_sessions"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Seller's wallet address or session pseudonym
    seller_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    # The token the seller wants to offload
    input_token: Mapped[str] = mapped_column(String(42), nullable=False)
    input_amount: Mapped[str] = mapped_column(String(78), nullable=False)
    # Settled flag — True once a deal was accepted and submitted on-chain
    settled: Mapped[bool] = mapped_column(default=False, index=True)
    # Serialized chat log — list of {sender, text, timestamp} dicts
    chat_log: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # Agent summary of the negotiation outcome
    outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Final agreed payout amount in wei (set on settlement)
    agreed_payout: Mapped[str | None] = mapped_column(String(78), nullable=True)
    # Error message if negotiation failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    # Relationship — uses string reference to avoid circular import.
    shop: Mapped["Shop"] = relationship(back_populates="negotiations")
