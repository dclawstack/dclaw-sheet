"""AI Sheet Copilot.

Tool-using LLM client. Three providers wired:

- "openrouter": HTTP call to OpenRouter when OPENROUTER_API_KEY is set.
- "ollama":     local Ollama (/api/chat) when reachable.
- "stub":       deterministic local heuristic fallback (also used in tests).

The "auto" mode tries openrouter → ollama → stub in order. Every provider
returns the same envelope: a list of tool calls the frontend can apply.

Tools the model can call:
    write_formula(row, column, formula)
    make_chart(start, end, has_header?)
    propose_clean(action, column?, args?)        # informational only in v1
    run_sql(query)                                # informational only in v1
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.services.formula.engine import (
    cell_ref_to_coord,
    col_letters_to_index,
    index_to_col_letters,
)


@dataclass
class CopilotResponse:
    provider: str
    message: str
    tool_calls: list[dict[str, Any]]


_SYSTEM_PROMPT = """You are DClaw Sheet's AI copilot. You help a spreadsheet user by emitting tool calls.

Output STRICT JSON with this shape:
{"message": "<short reply to the user>", "tool_calls": [<tool>, ...]}

Available tools:
- {"tool": "write_formula", "row": <int, 0-indexed>, "column": <int, 0-indexed>, "formula": "=..."}
- {"tool": "make_chart", "start": "A1", "end": "B10", "has_header": true}
- {"tool": "run_sql", "query": "SELECT ..."}
- {"tool": "propose_clean", "action": "trim|dedupe|fill_blanks", "column": <int|null>}

Only emit JSON. No prose outside the JSON object.
"""


async def _grid_summary(db: AsyncSession, sheet_id: UUID) -> dict[str, Any]:
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        return {"error": "sheet not found"}
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    if not cells:
        return {"sheet_name": sheet.name, "row_count": 0, "column_count": 0, "headers": [], "preview": []}

    max_row = max(c.row for c in cells)
    max_col = max(c.column for c in cells)
    by_coord: dict[tuple[int, int], Any] = {(c.row, c.column): c for c in cells}

    headers: list[str] = []
    for c in range(max_col + 1):
        cell = by_coord.get((0, c))
        headers.append(cell.value or index_to_col_letters(c) if cell else index_to_col_letters(c))

    preview: list[list[Any]] = []
    for r in range(1, min(max_row, 6) + 1):
        row_vals = []
        for c in range(max_col + 1):
            cell = by_coord.get((r, c))
            row_vals.append(cell.value if cell else None)
        preview.append(row_vals)

    return {
        "sheet_name": sheet.name,
        "row_count": max_row + 1,
        "column_count": max_col + 1,
        "headers": headers,
        "preview": preview,
    }


def _provider_chain() -> list[str]:
    mode = settings.ai_provider.lower()
    if mode == "stub":
        return ["stub"]
    if mode == "openrouter":
        return ["openrouter"]
    if mode == "ollama":
        return ["ollama"]
    chain = []
    if settings.openrouter_api_key:
        chain.append("openrouter")
    chain.append("ollama")
    chain.append("stub")
    return chain


async def _call_openrouter(prompt: str, grid: dict[str, Any]) -> CopilotResponse:
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt + "\n\nGRID:\n" + json.dumps(grid)},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 800,
    }
    headers = {"Authorization": f"Bearer {settings.openrouter_api_key}"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        r.raise_for_status()
        body = r.json()
    content = body["choices"][0]["message"]["content"]
    return _parse_envelope(content, provider="openrouter")


async def _call_ollama(prompt: str, grid: dict[str, Any]) -> CopilotResponse:
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt + "\n\nGRID:\n" + json.dumps(grid)},
        ],
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
        r.raise_for_status()
        body = r.json()
    content = body.get("message", {}).get("content", "")
    return _parse_envelope(content, provider="ollama")


def _parse_envelope(content: str, *, provider: str) -> CopilotResponse:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            return CopilotResponse(provider=provider, message=content[:500], tool_calls=[])
        data = json.loads(match.group(0))
    return CopilotResponse(
        provider=provider,
        message=str(data.get("message", "")),
        tool_calls=list(data.get("tool_calls", [])),
    )


def _stub_response(prompt: str, grid: dict[str, Any]) -> CopilotResponse:
    """Deterministic, dependency-free fallback that recognises a handful of
    common asks and emits valid tool calls."""
    p = prompt.lower().strip()
    row_count = int(grid.get("row_count") or 0)
    col_count = int(grid.get("column_count") or 0)
    headers = grid.get("headers") or []

    def first_numeric_col() -> int | None:
        preview = grid.get("preview") or []
        for c in range(col_count):
            for row in preview:
                if c >= len(row):
                    continue
                v = row[c]
                if v is None or v == "":
                    continue
                try:
                    float(v)
                    return c
                except (TypeError, ValueError):
                    pass
                break
        return None

    if any(k in p for k in ("sum", "total", "add")):
        col = first_numeric_col() or 0
        col_letter = index_to_col_letters(col)
        target_row = max(row_count, 2)
        return CopilotResponse(
            provider="stub",
            message=f"I added =SUM of column {col_letter} just below the data.",
            tool_calls=[{
                "tool": "write_formula",
                "row": target_row,
                "column": col,
                "formula": f"=SUM({col_letter}2:{col_letter}{row_count})",
            }],
        )
    if any(k in p for k in ("average", "avg", "mean")):
        col = first_numeric_col() or 0
        col_letter = index_to_col_letters(col)
        target_row = max(row_count, 2)
        return CopilotResponse(
            provider="stub",
            message=f"I added =AVERAGE of column {col_letter}.",
            tool_calls=[{
                "tool": "write_formula",
                "row": target_row,
                "column": col,
                "formula": f"=AVERAGE({col_letter}2:{col_letter}{row_count})",
            }],
        )
    if any(k in p for k in ("chart", "plot", "graph", "visualise", "visualize")):
        end_col = max(col_count - 1, 1)
        end_row = max(row_count, 2)
        return CopilotResponse(
            provider="stub",
            message="Plotted a chart over the data range.",
            tool_calls=[{
                "tool": "make_chart",
                "start": "A1",
                "end": f"{index_to_col_letters(end_col)}{end_row}",
                "has_header": True,
            }],
        )
    if any(k in p for k in ("trim", "clean", "dedupe", "blank")):
        return CopilotResponse(
            provider="stub",
            message="Suggested a TRIM pass on text columns.",
            tool_calls=[{"tool": "propose_clean", "action": "trim", "column": None}],
        )
    return CopilotResponse(
        provider="stub",
        message="I'm not sure how to help with that yet. Try: 'sum column A', 'average revenue', or 'chart this'.",
        tool_calls=[],
    )


async def answer(
    db: AsyncSession,
    sheet_id: UUID,
    prompt: str,
) -> CopilotResponse:
    grid = await _grid_summary(db, sheet_id)
    last_error: Exception | None = None
    for provider in _provider_chain():
        try:
            if provider == "openrouter":
                if not settings.openrouter_api_key:
                    continue
                return await _call_openrouter(prompt, grid)
            if provider == "ollama":
                return await _call_ollama(prompt, grid)
            return _stub_response(prompt, grid)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError) as exc:
            last_error = exc
            continue
    if last_error:
        return CopilotResponse(
            provider="stub",
            message=f"All AI providers failed ({type(last_error).__name__}). Falling back to stub.",
            tool_calls=[],
        )
    return _stub_response(prompt, grid)


__all__ = ["CopilotResponse", "answer"]
