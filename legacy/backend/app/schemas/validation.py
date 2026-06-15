from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


RuleType = Literal["type", "range", "regex", "lookup", "formula"]


class ValidationRuleCreate(BaseModel):
    column: int = Field(ge=0)
    rule_type: RuleType
    params: dict[str, Any]
    message: str | None = Field(default=None, max_length=255)


class ValidationRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sheet_id: UUID
    column: int
    rule_type: str
    params: dict[str, Any]
    message: str | None
    created_at: datetime
    updated_at: datetime


class ValidationIssueRead(BaseModel):
    row: int
    column: int
    value: str | None
    rule_type: str
    message: str


class ValidationRunResponse(BaseModel):
    issues: list[ValidationIssueRead]
    total: int


class RuleSuggestion(BaseModel):
    column: int
    rule_type: str
    params: dict[str, Any]


class SuggestionsResponse(BaseModel):
    suggestions: list[RuleSuggestion]
