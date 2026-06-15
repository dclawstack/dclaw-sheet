import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utils import utc_now
from app.models.base import Base


class ValidationRule(Base):
    """One validation rule attached to a (sheet, column) pair.

    rule_type: one of 'type' | 'range' | 'regex' | 'lookup' | 'formula'
    params:    JSON args depending on rule_type, e.g.
               type   => {"expected": "number" | "boolean" | "date"}
               range  => {"min": 0, "max": 100}
               regex  => {"pattern": "^[A-Z]{3}$"}
               lookup => {"values": ["paid","invoiced","refunded"]}
               formula=> {"formula": "=AND(A1>0,A1<1000)"}
    """

    __tablename__ = "validation_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sheet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sheets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
