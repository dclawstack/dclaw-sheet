from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.models import ValidationRule
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.schemas.validation import (
    RuleSuggestion,
    SuggestionsResponse,
    ValidationIssueRead,
    ValidationRuleCreate,
    ValidationRuleRead,
    ValidationRunResponse,
)
from app.services.telemetry import emit
from app.services.validation import (
    default_message,
    evaluate_rule,
    infer_rules_for_column,
)

router = APIRouter()


async def _scoped_sheet(sheet_id: UUID, scope: WorkspaceScope, db: AsyncSession):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await WorkbookRepository(db).get_for_workspace(
        sheet.workbook_id, scope.workspace.id
    )
    if workbook is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    return sheet


@router.get("/sheets/{sheet_id}/rules", response_model=list[ValidationRuleRead])
async def list_rules(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    result = await db.execute(
        select(ValidationRule)
        .where(ValidationRule.sheet_id == sheet_id)
        .order_by(ValidationRule.column, ValidationRule.created_at)
    )
    return [ValidationRuleRead.model_validate(r) for r in result.scalars().all()]


@router.post("/sheets/{sheet_id}/rules", response_model=ValidationRuleRead, status_code=201)
async def create_rule(
    sheet_id: UUID,
    payload: ValidationRuleCreate,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    rule = ValidationRule(
        sheet_id=sheet_id,
        column=payload.column,
        rule_type=payload.rule_type,
        params=payload.params,
        message=payload.message,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await emit(
        "validation.rule_added",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        sheet_id=sheet_id,
        payload={"rule_type": rule.rule_type, "column": rule.column},
    )
    return ValidationRuleRead.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    rule = (
        await db.execute(select(ValidationRule).where(ValidationRule.id == rule_id))
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await _scoped_sheet(rule.sheet_id, scope, db)
    await db.delete(rule)
    await db.commit()


@router.post("/sheets/{sheet_id}/run", response_model=ValidationRunResponse)
async def run_validation(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    rules_result = await db.execute(
        select(ValidationRule).where(ValidationRule.sheet_id == sheet_id)
    )
    rules = list(rules_result.scalars().all())
    cells = await CellRepository(db).list_by_sheet(sheet_id)

    issues: list[ValidationIssueRead] = []
    rules_by_col: dict[int, list[ValidationRule]] = {}
    for r in rules:
        rules_by_col.setdefault(r.column, []).append(r)

    for cell in cells:
        col_rules = rules_by_col.get(cell.column)
        if not col_rules:
            continue
        for r in col_rules:
            if not evaluate_rule(r.rule_type, r.params, cell.value):
                issues.append(
                    ValidationIssueRead(
                        row=cell.row,
                        column=cell.column,
                        value=cell.value,
                        rule_type=r.rule_type,
                        message=r.message or default_message(r.rule_type, r.params),
                    )
                )
    return ValidationRunResponse(issues=issues, total=len(issues))


@router.post("/sheets/{sheet_id}/suggest", response_model=SuggestionsResponse)
async def suggest_rules(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    if not cells:
        return SuggestionsResponse(suggestions=[])
    by_col: dict[int, list[str | None]] = {}
    header_row = min(c.row for c in cells)
    for c in cells:
        if c.row == header_row:
            continue
        by_col.setdefault(c.column, []).append(c.value)

    suggestions: list[RuleSuggestion] = []
    for col, values in by_col.items():
        for proposal in infer_rules_for_column(values):
            suggestions.append(
                RuleSuggestion(
                    column=col,
                    rule_type=proposal["rule_type"],
                    params=proposal["params"],
                )
            )
    return SuggestionsResponse(suggestions=suggestions)
