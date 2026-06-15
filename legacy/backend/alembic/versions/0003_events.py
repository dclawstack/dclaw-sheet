"""events table — telemetry / retention surface

Revision ID: 0003_events
Revises: 0002_connections
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0003_events"
down_revision: Union[str, None] = "0002_connections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column(
            "workbook_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("workbooks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "sheet_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sheets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_events_event_type", "events", ["event_type"])
    op.create_index("ix_events_user_id", "events", ["user_id"])
    op.create_index("ix_events_workbook_id", "events", ["workbook_id"])
    op.create_index("ix_events_created_at", "events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_events_created_at", table_name="events")
    op.drop_index("ix_events_workbook_id", table_name="events")
    op.drop_index("ix_events_user_id", table_name="events")
    op.drop_index("ix_events_event_type", table_name="events")
    op.drop_table("events")
