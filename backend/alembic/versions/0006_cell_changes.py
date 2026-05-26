"""cell_changes table — append-only version history

Revision ID: 0006_cell_changes
Revises: 0005_validation_rules
Create Date: 2026-05-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_cell_changes"
down_revision: Union[str, None] = "0005_validation_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cell_changes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sheet_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sheets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workbook_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("workbooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row", sa.Integer(), nullable=False),
        sa.Column("column", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=16), nullable=False),
        sa.Column("value_before", sa.Text(), nullable=True),
        sa.Column("formula_before", sa.Text(), nullable=True),
        sa.Column("value_after", sa.Text(), nullable=True),
        sa.Column("formula_after", sa.Text(), nullable=True),
        sa.Column("data_type_after", sa.String(length=16), nullable=True),
        sa.Column("actor_email", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_cell_changes_sheet_id", "cell_changes", ["sheet_id"])
    op.create_index("ix_cell_changes_workbook_id", "cell_changes", ["workbook_id"])
    op.create_index("ix_cell_changes_created_at", "cell_changes", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_cell_changes_created_at", table_name="cell_changes")
    op.drop_index("ix_cell_changes_workbook_id", table_name="cell_changes")
    op.drop_index("ix_cell_changes_sheet_id", table_name="cell_changes")
    op.drop_table("cell_changes")
