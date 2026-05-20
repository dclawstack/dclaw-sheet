"""connections table + sheets.source_connection_id

Revision ID: 0002_connections
Revises: 0001_init
Create Date: 2026-05-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0002_connections"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connections",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("config_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_row_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("sheets") as batch:
        batch.add_column(
            sa.Column(
                "source_connection_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("connections.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch.create_index("ix_sheets_source_connection_id", ["source_connection_id"])


def downgrade() -> None:
    with op.batch_alter_table("sheets") as batch:
        batch.drop_index("ix_sheets_source_connection_id")
        batch.drop_column("source_connection_id")
    op.drop_table("connections")
