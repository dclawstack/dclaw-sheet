"""initial schema: workbooks, sheets, cells

Revision ID: 0001_init
Revises:
Create Date: 2026-05-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workbooks",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "sheets",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "workbook_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("workbooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("column_count", sa.Integer(), nullable=False, server_default="26"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sheets_workbook_id", "sheets", ["workbook_id"])

    op.create_table(
        "cells",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sheet_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sheets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row", sa.Integer(), nullable=False),
        sa.Column("column", sa.Integer(), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("data_type", sa.String(length=16), nullable=False, server_default="string"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("sheet_id", "row", "column", name="uq_cell_sheet_row_column"),
    )
    op.create_index("ix_cells_sheet_id", "cells", ["sheet_id"])


def downgrade() -> None:
    op.drop_index("ix_cells_sheet_id", table_name="cells")
    op.drop_table("cells")
    op.drop_index("ix_sheets_workbook_id", table_name="sheets")
    op.drop_table("sheets")
    op.drop_table("workbooks")
