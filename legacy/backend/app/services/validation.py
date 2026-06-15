"""Validation rule engine + AI-style heuristic rule inference.

Rule types:
- type    : params={"expected": "number" | "boolean" | "date" | "string"}
- range   : params={"min"?: number, "max"?: number}
- regex   : params={"pattern": str}
- lookup  : params={"values": [str, ...]}
- formula : params={"formula": "=AND(A1>0, A1<100)"} — evaluated per-cell

Heuristic rule inference (`infer_rules_for_column`) looks at the values in
a column and proposes the most-likely rules — used by the "suggest rules"
endpoint as a stand-in for an LLM call.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable

from app.services.formula.engine import (
    FormulaError,
    GridContext,
    cell_ref_to_coord,
    evaluate,
)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


@dataclass
class ValidationIssue:
    row: int
    column: int
    value: str | None
    rule_type: str
    message: str


def _coerce(value: Any) -> Any:
    if value is None or value == "":
        return None
    s = str(value)
    if s.upper() == "TRUE":
        return True
    if s.upper() == "FALSE":
        return False
    try:
        if "." not in s and "e" not in s.lower():
            return int(s)
        return float(s)
    except ValueError:
        if _DATE_RE.match(s):
            try:
                return datetime.fromisoformat(s.split("T")[0]).date()
            except ValueError:
                pass
        return s


def _is_type(value: Any, expected: str) -> bool:
    if value is None:
        return True  # empty cells aren't type violations
    coerced = _coerce(value)
    if expected == "number":
        return isinstance(coerced, (int, float)) and not isinstance(coerced, bool)
    if expected == "boolean":
        return isinstance(coerced, bool)
    if expected == "date":
        return isinstance(coerced, date)
    if expected == "string":
        return isinstance(coerced, str)
    return True


def evaluate_rule(rule_type: str, params: dict, value: Any) -> bool:
    """Return True if `value` passes the rule, False otherwise. Empty values
    always pass (use a separate 'required' rule type later if needed)."""
    if value is None or value == "":
        return True

    if rule_type == "type":
        return _is_type(value, params.get("expected", "string"))

    if rule_type == "range":
        coerced = _coerce(value)
        if not isinstance(coerced, (int, float)) or isinstance(coerced, bool):
            return False
        lo = params.get("min")
        hi = params.get("max")
        if lo is not None and coerced < lo:
            return False
        if hi is not None and coerced > hi:
            return False
        return True

    if rule_type == "regex":
        pattern = params.get("pattern", "")
        try:
            return re.search(pattern, str(value)) is not None
        except re.error:
            return False

    if rule_type == "lookup":
        allowed = params.get("values") or []
        return str(value) in {str(v) for v in allowed}

    if rule_type == "formula":
        formula = params.get("formula", "")
        if not formula:
            return False
        ctx = GridContext(values={(0, 0): _coerce(value)})
        try:
            result = evaluate(formula.replace("A1", "A1"), ctx, current=(0, 0))
        except FormulaError:
            return False
        return bool(result)

    return True


def default_message(rule_type: str, params: dict) -> str:
    if rule_type == "type":
        return f"Expected type {params.get('expected', 'string')}"
    if rule_type == "range":
        lo, hi = params.get("min"), params.get("max")
        if lo is not None and hi is not None:
            return f"Value must be between {lo} and {hi}"
        if lo is not None:
            return f"Value must be >= {lo}"
        if hi is not None:
            return f"Value must be <= {hi}"
        return "Value out of range"
    if rule_type == "regex":
        return f"Value must match pattern {params.get('pattern', '')}"
    if rule_type == "lookup":
        return f"Value must be one of {', '.join(map(str, params.get('values', [])))}"
    if rule_type == "formula":
        return f"Value must satisfy {params.get('formula', '')}"
    return "Validation failed"


def infer_rules_for_column(values: Iterable[Any]) -> list[dict]:
    """Heuristic AI-stub: look at the column data and propose rules."""
    samples = [v for v in values if v is not None and v != ""]
    if not samples:
        return []

    coerced = [_coerce(v) for v in samples]
    numerics = [c for c in coerced if isinstance(c, (int, float)) and not isinstance(c, bool)]
    dates = [c for c in coerced if isinstance(c, date)]
    bools = [c for c in coerced if isinstance(c, bool)]
    strings = [c for c in coerced if isinstance(c, str)]

    proposals: list[dict] = []
    if len(numerics) / len(coerced) >= 0.8:
        proposals.append({"rule_type": "type", "params": {"expected": "number"}})
        lo, hi = min(numerics), max(numerics)
        # Widen 5% for tolerance
        span = max(hi - lo, 1)
        proposals.append(
            {
                "rule_type": "range",
                "params": {
                    "min": round(lo - 0.05 * span, 4),
                    "max": round(hi + 0.05 * span, 4),
                },
            }
        )
        return proposals
    if len(dates) / len(coerced) >= 0.8:
        proposals.append({"rule_type": "type", "params": {"expected": "date"}})
        return proposals
    if len(bools) / len(coerced) >= 0.8:
        proposals.append({"rule_type": "type", "params": {"expected": "boolean"}})
        return proposals
    if len(strings) >= 1:
        unique = {str(s) for s in strings}
        # Small categorical set → lookup
        if len(unique) <= max(5, len(strings) // 4):
            proposals.append(
                {"rule_type": "lookup", "params": {"values": sorted(unique)}}
            )
            return proposals
        # Looks email-ish?
        if all("@" in str(s) for s in strings):
            proposals.append(
                {
                    "rule_type": "regex",
                    "params": {"pattern": r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"},
                }
            )
    return proposals
