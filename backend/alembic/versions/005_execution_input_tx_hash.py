"""Add input_tx_hash to Execution model.

Revision ID: 005
Revises: 004
Create Date: 2026-05-02

Stores the acceptOffer transaction hash from the seller's wallet.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "executions",
        sa.Column("input_tx_hash", sa.String(66), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("executions", "input_tx_hash")
