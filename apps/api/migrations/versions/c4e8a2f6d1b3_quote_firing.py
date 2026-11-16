"""quotes.firing: dados da queima (horas por queima, queimas, peças por fornada)

Revision ID: c4e8a2f6d1b3
Revises: b7e3d1a9c4f2
Create Date: 2026-11-14 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e8a2f6d1b3'
down_revision: str | None = 'b7e3d1a9c4f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("quotes") as batch_op:
        batch_op.add_column(sa.Column("firing", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("quotes") as batch_op:
        batch_op.drop_column("firing")
