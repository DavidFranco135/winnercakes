"""customer birth date

Revision ID: f2b6d8a1c3e5
Revises: e7a1f3c9b2d4
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f2b6d8a1c3e5"
down_revision: str | None = "e7a1f3c9b2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("birth_date", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("customers", "birth_date")
