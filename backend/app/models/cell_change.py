import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utc_now
from app.models.base import Base


class CellChange(Base):
    """Append-only log of every cell mutation. Powers version history,
    branching, and the immutable audit trail (2.11).

    operation: "upsert" | "clear"
    """

    __tablename__ = "cell_changes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sheet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sheets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workbook_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workbooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)
    value_before: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_before: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_after: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_after: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_type_after: Mapped[str | None] = mapped_column(String(16), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, nullable=False, index=True
    )
