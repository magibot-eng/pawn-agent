"""Add input_token and input_amount to Execution model.

Revision ID: 004
Revises: 003
Create Date: 2026-05-02

This migration adds the input_token and input_amount columns to the executions
table to track the ERC-20 input side of the atomic swap settlement.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "executions",
        sa.Column("input_token", sa.String(42), nullable=True),
    )
    op.add_column(
        "executions",
        sa.Column("input_amount", sa.String(78), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("executions", "input_amount")
    op.drop_column("executions", "input_token")
