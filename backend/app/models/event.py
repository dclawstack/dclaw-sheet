import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utc_now
from app.models.base import Base


class Event(Base):
    """Lightweight activity log. Powers the retention dashboard and gives the
    YC demo a real "users are doing things" surface.

    user_id is a free-form string for now (no auth yet); 1.9 will swap it for
    a real FK once Logto + multi-tenancy land.
    """

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    workbook_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workbooks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sheet_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sheets.id", ondelete="SET NULL"),
        nullable=True,
    )
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False, index=True)
