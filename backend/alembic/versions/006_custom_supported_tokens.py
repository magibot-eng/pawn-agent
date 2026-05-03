"""Add custom_supported_tokens to Shop model.

Revision ID: 006
Revises: 005
Create Date: 2026-05-02

Allows shop owners to add their own custom ERC-20 token addresses
which are merged into the known token list when checking wallet balances.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column("custom_supported_tokens", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("shops", "custom_supported_tokens")
