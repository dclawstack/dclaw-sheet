"""Sheet recalc: re-evaluate all formula cells against the current grid.

v1 strategy: build a dependency graph from extracted refs, topo-sort the formula
cells, evaluate each in order, and persist computed values. Cycles short-circuit
with a #CIRC! error on every offending cell.
"""
from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cell
from app.repositories.cell_repo import CellRepository
from app.services.formula.engine import (
    FormulaError,
    GridContext,
    _coerce_cell,
    evaluate,
    extract_refs,
    format_result,
    is_formula,
    parse,
)


async def recalc_sheet(db: AsyncSession, sheet_id: UUID) -> list[Cell]:
    """Recompute every formula cell on a sheet. Returns the mutated cells."""
    repo = CellRepository(db)
    cells = await repo.list_by_sheet(sheet_id)

    grid: dict[tuple[int, int], object] = {}
    formula_cells: dict[tuple[int, int], Cell] = {}
    for c in cells:
        coord = (c.row, c.column)
        if is_formula(c.formula):
            formula_cells[coord] = c
        else:
            grid[coord] = _coerce_cell(c.value, c.data_type)

    if not formula_cells:
        return []

    parsed: dict[tuple[int, int], object] = {}
    deps: dict[tuple[int, int], set[tuple[int, int]]] = {}
    for coord, c in formula_cells.items():
        try:
            ast = parse(c.formula or "")
            parsed[coord] = ast
            refs = extract_refs(ast)
            deps[coord] = {r for r in refs if r != coord}
        except FormulaError as exc:
            c.value = f"#{exc.code}!"
            parsed[coord] = None
            deps[coord] = set()

    order = _topo_order(set(formula_cells.keys()), deps)
    cyclic = set(formula_cells.keys()) - set(order)
    for coord in cyclic:
        formula_cells[coord].value = "#CIRC!"

    ctx = GridContext(values=dict(grid))
    for coord in order:
        ast = parsed.get(coord)
        cell = formula_cells[coord]
        if ast is None:
            continue
        try:
            result = evaluate(ast, ctx)
            cell.value = format_result(result)
            cell.data_type = _infer_type(result)
            ctx.values[coord] = result
        except FormulaError as exc:
            cell.value = f"#{exc.code}!"
            cell.data_type = "string"

    await db.commit()
    for c in formula_cells.values():
        await db.refresh(c)
    return list(formula_cells.values())


def _topo_order(
    nodes: set[tuple[int, int]],
    deps: dict[tuple[int, int], set[tuple[int, int]]],
) -> list[tuple[int, int]]:
    # Restrict deps to nodes that exist as formulas; plain cells are leaves.
    formula_deps = {n: {d for d in deps.get(n, set()) if d in nodes} for n in nodes}
    in_degree: dict[tuple[int, int], int] = defaultdict(int)
    rev: dict[tuple[int, int], set[tuple[int, int]]] = defaultdict(set)
    for n, ds in formula_deps.items():
        in_degree[n] = len(ds)
        for d in ds:
            rev[d].add(n)
    ready = [n for n, deg in in_degree.items() if deg == 0]
    order: list[tuple[int, int]] = []
    while ready:
        n = ready.pop()
        order.append(n)
        for m in rev[n]:
            in_degree[m] -= 1
            if in_degree[m] == 0:
                ready.append(m)
    return order


def _infer_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    return "string"
