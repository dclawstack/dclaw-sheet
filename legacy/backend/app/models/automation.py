import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utc_now
from app.models.base import Base


class Automation(Base):
    """A user-defined trigger → actions chain.

    trigger_type: "manual" | "cell_change" | "webhook" | "schedule"
    trigger_config: depends on trigger_type, e.g.
        cell_change => {"sheet_id": "...", "row": 0, "column": 0}
        webhook     => {"slug": "send-mrr"}
        schedule    => {"cron": "0 9 * * 1"}     # not enforced in v1
        manual      => {}
    actions: list of {action_type, config} dicts. Action types:
        emit_event   => {"event_type": "automation.fired", "payload": {...}}
        write_cell   => {"sheet_id": "...", "row": int, "column": int,
                         "value": str | None, "formula": str | None}
        append_row   => {"sheet_id": "...", "values": [{"column": int, "value": str}, ...]}
    """

    __tablename__ = "automations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workbook_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workbooks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    actions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
