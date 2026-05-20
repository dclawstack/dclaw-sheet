import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Integer, UniqueConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utc_now
from app.models.base import Base


class Cell(Base):
    __tablename__ = "cells"
    __table_args__ = (
        UniqueConstraint("sheet_id", "row", "column", name="uq_cell_sheet_row_column"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sheet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sheets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="string")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    sheet: Mapped["Sheet"] = relationship(back_populates="cells", lazy="selectin")
