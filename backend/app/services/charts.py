"""Heuristic chart recommendations.

Reads a 2D range from a sheet, infers column types, picks a chart kind
(bar / line / scatter), and emits a Vega-Lite v5 spec the frontend can render.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.cell_repo import CellRepository
from app.services.formula.engine import cell_ref_to_coord

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _column_kind(values: list[Any]) -> str:
    nums = 0
    dates = 0
    total = 0
    for v in values:
        if v is None or v == "":
            continue
        total += 1
        if isinstance(v, str):
            if _DATE_RE.match(v):
                try:
                    datetime.fromisoformat(v.split("T")[0])
                    dates += 1
                    continue
                except ValueError:
                    pass
            try:
                float(v)
                nums += 1
                continue
            except ValueError:
                pass
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            nums += 1
            continue
    if total == 0:
        return "nominal"
    if dates / total >= 0.6:
        return "temporal"
    if nums / total >= 0.6:
        return "quantitative"
    return "nominal"


def _coerce(value: Any, kind: str) -> Any:
    if value is None or value == "":
        return None
    if kind == "quantitative":
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return value


def _pick_chart(col_kinds: list[str]) -> str:
    if len(col_kinds) < 2:
        return "bar"
    first, second = col_kinds[0], col_kinds[1]
    quants = [k for k in col_kinds if k == "quantitative"]
    if first == "temporal" and "quantitative" in col_kinds:
        return "line"
    if first == "nominal" and "quantitative" in col_kinds:
        return "bar"
    if len(quants) >= 2:
        return "scatter"
    return "bar"


def recommend_chart(headers: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    if not headers or not rows:
        return {"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "data": {"values": []}}

    columns: list[list[Any]] = []
    for c_idx in range(len(headers)):
        columns.append([row[c_idx] if c_idx < len(row) else None for row in rows])
    kinds = [_column_kind(col) for col in columns]
    kind = _pick_chart(kinds)

    records: list[dict[str, Any]] = []
    for row in rows:
        record: dict[str, Any] = {}
        for c_idx, name in enumerate(headers):
            v = row[c_idx] if c_idx < len(row) else None
            record[name] = _coerce(v, kinds[c_idx])
        records.append(record)

    x_field = headers[0]
    if kind == "scatter":
        quant_indices = [i for i, k in enumerate(kinds) if k == "quantitative"]
        x_field = headers[quant_indices[0]]
        y_field = headers[quant_indices[1]]
        x_type = "quantitative"
        y_type = "quantitative"
    else:
        x_type = kinds[0]
        y_indices = [i for i, k in enumerate(kinds) if k == "quantitative" and i != 0]
        if not y_indices:
            y_indices = [i for i in range(len(headers)) if i != 0]
        y_field = headers[y_indices[0]] if y_indices else (headers[1] if len(headers) > 1 else headers[0])
        y_type = "quantitative"

    mark = {"bar": "bar", "line": "line", "scatter": "point"}[kind]

    spec: dict[str, Any] = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "description": f"{kind.title()} chart of {y_field} by {x_field}",
        "data": {"values": records},
        "mark": mark,
        "encoding": {
            "x": {"field": x_field, "type": x_type},
            "y": {"field": y_field, "type": y_type},
        },
        "width": "container",
        "height": 300,
    }
    return spec


async def recommend_chart_for_range(
    db: AsyncSession,
    sheet_id: UUID,
    start_ref: str,
    end_ref: str,
    has_header: bool = True,
) -> dict[str, Any]:
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    by_coord = {(c.row, c.column): c for c in cells}

    r1, c1 = cell_ref_to_coord(start_ref)
    r2, c2 = cell_ref_to_coord(end_ref)
    row_lo, row_hi = min(r1, r2), max(r1, r2)
    col_lo, col_hi = min(c1, c2), max(c1, c2)

    grid: list[list[Any]] = []
    for r in range(row_lo, row_hi + 1):
        row_vals: list[Any] = []
        for c in range(col_lo, col_hi + 1):
            cell = by_coord.get((r, c))
            row_vals.append(cell.value if cell else None)
        grid.append(row_vals)

    if has_header and grid:
        headers = [str(h) if h is not None else f"col{idx}" for idx, h in enumerate(grid[0])]
        rows = grid[1:]
    else:
        headers = [f"col{idx}" for idx in range(col_hi - col_lo + 1)]
        rows = grid
    return recommend_chart(headers, rows)
