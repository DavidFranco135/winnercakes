"""festival live (cardápio do festival com estoque de fatias)

Revision ID: e7a1f3c9b2d4
Revises: c4e8a2f6d1b3
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7a1f3c9b2d4"
down_revision: str | None = "c4e8a2f6d1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "festival_live",
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("day", sa.String(length=10), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("organization_id", "day"),
    )


def downgrade() -> None:
    op.drop_table("festival_live")
