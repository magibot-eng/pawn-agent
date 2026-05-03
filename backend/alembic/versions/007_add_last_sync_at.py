"""Add last_sync_at to shops table"""

from alembic import op

revision = '007_add_last_sync_at'
down_revision = '006_custom_supported_tokens'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE shops
        ADD COLUMN IF NOT EXISTS last_sync_at VARCHAR(32)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE shops DROP COLUMN IF EXISTS last_sync_at")
