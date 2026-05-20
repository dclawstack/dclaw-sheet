import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utc_now
from app.models.base import Base


class Sheet(Base):
    __tablename__ = "sheets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workbook_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workbooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False, default=26)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    workbook: Mapped["Workbook"] = relationship(back_populates="sheets", lazy="selectin")
    cells: Mapped[list["Cell"]] = relationship(
        back_populates="sheet",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
