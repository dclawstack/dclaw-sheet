import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utc_now
from app.models.base import Base


class Workbook(Base):
    __tablename__ = "workbooks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    sheets: Mapped[list["Sheet"]] = relationship(
        back_populates="workbook",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
