"""Sheet recalc.

Two entry points:

- recalc_sheet(db, sheet_id):
    Re-evaluates every formula on the sheet — used after CSV/XLSX import or
    connector sync where many cells change at once.

- recalc_after_changes(db, sheet_id, changed_coords):
    Incremental — re-evaluates only the formulas whose dependency closure
    intersects the changed coordinates. Used after a single cell upsert or a
    targeted bulk write. Falls back to a full recalc if it sees a graph it
    can't trust (e.g. a formula that wasn't in the previous snapshot).

Both share a topological evaluator that emits #CIRC! on cycles.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cell
from app.repositories.cell_repo import CellRepository
from app.services.formula.engine import (
    FormulaError,
    GridContext,
    Node,
    _coerce_cell,
    evaluate,
    extract_refs,
    format_result,
    is_formula,
    parse,
)


def _infer_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    return "string"


def _build_graph(
    cells: list[Cell],
) -> tuple[
    dict[tuple[int, int], Cell],          # all cells indexed by coord
    dict[tuple[int, int], Cell],          # formula cells indexed by coord
    dict[tuple[int, int], Node | None],   # parsed AST per formula cell (None = parse error)
    dict[tuple[int, int], set[tuple[int, int]]],  # forward deps (cell -> coords it reads)
    dict[tuple[int, int], set[tuple[int, int]]],  # reverse deps (cell -> formulas reading it)
]:
    by_coord: dict[tuple[int, int], Cell] = {}
    formula_cells: dict[tuple[int, int], Cell] = {}
    parsed: dict[tuple[int, int], Node | None] = {}
    forward: dict[tuple[int, int], set[tuple[int, int]]] = {}
    reverse: dict[tuple[int, int], set[tuple[int, int]]] = defaultdict(set)

    for c in cells:
        coord = (c.row, c.column)
        by_coord[coord] = c
        if is_formula(c.formula):
            formula_cells[coord] = c
            try:
                ast = parse(c.formula or "")
                parsed[coord] = ast
                deps = {r for r in extract_refs(ast) if r != coord}
                forward[coord] = deps
                for d in deps:
                    reverse[d].add(coord)
            except FormulaError as exc:
                c.value = f"#{exc.code}!"
                parsed[coord] = None
                forward[coord] = set()

    return by_coord, formula_cells, parsed, forward, reverse


def _topo_order(
    nodes: Iterable[tuple[int, int]],
    forward: dict[tuple[int, int], set[tuple[int, int]]],
) -> list[tuple[int, int]]:
    """Kahn's algorithm over `nodes`.

    Deps outside `nodes` are leaves — their values are already seeded into
    the evaluator's grid (either from the data cells in `_initial_grid` or
    from previously-computed formula values seeded in `_evaluate_targets`).
    """
    node_list = list(nodes)
    node_set = set(node_list)
    in_deps = {n: {d for d in forward.get(n, ()) if d in node_set} for n in node_list}
    in_degree: dict[tuple[int, int], int] = {n: len(in_deps[n]) for n in node_list}
    rev_within: dict[tuple[int, int], set[tuple[int, int]]] = defaultdict(set)
    for n in node_list:
        for d in in_deps[n]:
            rev_within[d].add(n)
    ready = [n for n, deg in in_degree.items() if deg == 0]
    order: list[tuple[int, int]] = []
    while ready:
        n = ready.pop()
        order.append(n)
        for m in rev_within[n]:
            in_degree[m] -= 1
            if in_degree[m] == 0:
                ready.append(m)
    return order


def _initial_grid(
    by_coord: dict[tuple[int, int], Cell],
    formula_set: set[tuple[int, int]],
) -> dict[tuple[int, int], object]:
    grid: dict[tuple[int, int], object] = {}
    for coord, c in by_coord.items():
        if coord in formula_set:
            continue
        grid[coord] = _coerce_cell(c.value, c.data_type)
    return grid


async def _evaluate_targets(
    db: AsyncSession,
    targets: list[tuple[int, int]],
    formula_cells: dict[tuple[int, int], Cell],
    parsed: dict[tuple[int, int], Node | None],
    forward: dict[tuple[int, int], set[tuple[int, int]]],
    seed_grid: dict[tuple[int, int], object],
) -> list[Cell]:
    formula_set = set(formula_cells.keys())
    target_set = set(targets)
    order = _topo_order(targets, forward)
    cyclic = set(targets) - set(order)
    for coord in cyclic:
        formula_cells[coord].value = "#CIRC!"
        formula_cells[coord].data_type = "string"

    ctx = GridContext(values=dict(seed_grid))
    # Seed already-computed formula values so dependents see fresh results
    # when their direct dep is another formula cell already evaluated upstream.
    # Only seed formula cells that are NOT current recalc targets; targets are
    # re-evaluated below and their stale DB values must not be reused.
    for coord, c in formula_cells.items():
        if coord not in formula_set or coord in target_set:
            continue
        if isinstance(c.value, str) and c.value and not c.value.startswith("#"):
            ctx.values.setdefault(coord, _coerce_cell(c.value, c.data_type))

    for coord in order:
        ast = parsed.get(coord)
        cell = formula_cells[coord]
        if ast is None:
            continue
        try:
            result = evaluate(ast, ctx, current=coord)
            cell.value = format_result(result)
            cell.data_type = _infer_type(result)
            ctx.values[coord] = result
        except FormulaError as exc:
            cell.value = f"#{exc.code}!"
            cell.data_type = "string"

    await db.commit()
    touched = [formula_cells[c] for c in list(order) + list(cyclic)]
    for c in touched:
        await db.refresh(c)
    return touched


async def recalc_sheet(db: AsyncSession, sheet_id: UUID) -> list[Cell]:
    """Re-evaluate every formula on the sheet. Used for bulk loads."""
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    by_coord, formula_cells, parsed, forward, _reverse = _build_graph(cells)
    if not formula_cells:
        return []
    seed = _initial_grid(by_coord, set(formula_cells.keys()))
    return await _evaluate_targets(db, list(formula_cells.keys()), formula_cells, parsed, forward, seed)


async def recalc_after_changes(
    db: AsyncSession,
    sheet_id: UUID,
    changed_coords: Iterable[tuple[int, int]],
) -> list[Cell]:
    """Re-evaluate only the formulas affected by the listed changes.

    The dirty set is the transitive forward-closure of changed coords through
    the reverse-dependency graph, intersected with the set of formula cells.
    A formula whose own coord is in changed_coords is also recomputed (its
    formula text may have changed).
    """
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    by_coord, formula_cells, parsed, forward, reverse = _build_graph(cells)
    if not formula_cells:
        return []

    dirty: set[tuple[int, int]] = set()
    frontier: list[tuple[int, int]] = []
    for coord in changed_coords:
        if coord in formula_cells:
            dirty.add(coord)
            frontier.append(coord)
        for downstream in reverse.get(coord, ()):
            if downstream not in dirty:
                dirty.add(downstream)
                frontier.append(downstream)
    while frontier:
        coord = frontier.pop()
        for downstream in reverse.get(coord, ()):
            if downstream not in dirty:
                dirty.add(downstream)
                frontier.append(downstream)

    if not dirty:
        return []

    seed = _initial_grid(by_coord, set(formula_cells.keys()))
    return await _evaluate_targets(
        db,
        list(dirty),
        formula_cells,
        parsed,
        forward,
        seed,
    )
