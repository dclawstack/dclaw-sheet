import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utc_now
from app.models.base import Base


class Connection(Base):
    """A user-defined live data source. Currently: 'postgres' or 'csv_url'.

    The full configuration (URL, query, credentials) is stored encrypted in
    `config_encrypted`; only the type and display name are queryable.
    """

    __tablename__ = "connections"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    config_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_row_count: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
