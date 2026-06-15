"""validation_rules table

Revision ID: 0005_validation_rules
Revises: 0004_auth
Create Date: 2026-05-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0005_validation_rules"
down_revision: Union[str, None] = "0004_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "validation_rules",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sheet_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sheets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("column", sa.Integer(), nullable=False),
        sa.Column("rule_type", sa.String(length=32), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("message", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_validation_rules_sheet_id", "validation_rules", ["sheet_id"])


def downgrade() -> None:
    op.drop_index("ix_validation_rules_sheet_id", table_name="validation_rules")
    op.drop_table("validation_rules")
