"""Pure-Python formula engine for DClaw Sheet.

Pipeline: source string -> tokenize -> parse (Pratt) -> AST -> evaluate against a
{(row, col): value} grid. ~30 built-in functions. Returns Python native values;
use format_result() to serialise to the storage layer.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Callable, Iterable


class TT(str, Enum):
    NUM = "NUM"
    STR = "STR"
    BOOL = "BOOL"
    CELL = "CELL"
    RANGE = "RANGE"
    IDENT = "IDENT"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    COMMA = "COMMA"
    PLUS = "PLUS"
    MINUS = "MINUS"
    MUL = "MUL"
    DIV = "DIV"
    POW = "POW"
    PCT = "PCT"
    EQ = "EQ"
    NEQ = "NEQ"
    LT = "LT"
    GT = "GT"
    LE = "LE"
    GE = "GE"
    AMP = "AMP"
    COLON = "COLON"
    EOF = "EOF"


@dataclass(frozen=True)
class Token:
    type: TT
    value: Any
    pos: int


class FormulaError(Exception):
    """Spreadsheet-style formula error (mapped to #CODE! when serialised)."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

_TOKEN_REGEX = re.compile(
    r"""
    \s+                                            # whitespace -> skipped
  | (?P<NUM>\d+(?:\.\d+)?)                         # number
  | "(?P<STR>(?:[^"\\]|\\.)*)"                     # quoted string
  | (?P<BOOL>TRUE|FALSE)\b                         # boolean literal
  | (?P<CELL>\$?[A-Z]+\$?\d+)\b                    # cell reference
  | (?P<IDENT>[A-Z_][A-Z0-9_\.]*)\b                # function / identifier
  | (?P<OP><>|<=|>=|\*|/|\+|-|\^|%|=|<|>|&|,|\(|\)|:)
    """,
    re.IGNORECASE | re.VERBOSE,
)

_OP_TO_TT = {
    "+": TT.PLUS,
    "-": TT.MINUS,
    "*": TT.MUL,
    "/": TT.DIV,
    "^": TT.POW,
    "%": TT.PCT,
    "=": TT.EQ,
    "<>": TT.NEQ,
    "<": TT.LT,
    ">": TT.GT,
    "<=": TT.LE,
    ">=": TT.GE,
    "&": TT.AMP,
    "(": TT.LPAREN,
    ")": TT.RPAREN,
    ",": TT.COMMA,
    ":": TT.COLON,
}


def tokenize(source: str) -> list[Token]:
    """Tokenise a formula. Accepts the leading '=' or omits it."""
    text = source.lstrip()
    if text.startswith("="):
        text = text[1:]

    tokens: list[Token] = []
    pos = 0
    while pos < len(text):
        m = _TOKEN_REGEX.match(text, pos)
        if not m:
            raise FormulaError("ERROR", f"Unexpected character at position {pos}: {text[pos]!r}")
        end = m.end()
        if m.group("NUM") is not None:
            value = float(m.group("NUM"))
            if value.is_integer():
                value = int(value)
            tokens.append(Token(TT.NUM, value, pos))
        elif m.group("STR") is not None:
            tokens.append(Token(TT.STR, m.group("STR"), pos))
        elif m.group("BOOL") is not None:
            tokens.append(Token(TT.BOOL, m.group("BOOL").upper() == "TRUE", pos))
        elif m.group("CELL") is not None:
            tokens.append(Token(TT.CELL, m.group("CELL").upper().replace("$", ""), pos))
        elif m.group("IDENT") is not None:
            tokens.append(Token(TT.IDENT, m.group("IDENT").upper(), pos))
        elif m.group("OP") is not None:
            op = m.group("OP")
            tokens.append(Token(_OP_TO_TT[op], op, pos))
        # else: whitespace match, skip silently
        pos = end

    # Fold CELL COLON CELL into RANGE tokens
    folded: list[Token] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if (
            t.type == TT.CELL
            and i + 2 < len(tokens)
            and tokens[i + 1].type == TT.COLON
            and tokens[i + 2].type == TT.CELL
        ):
            folded.append(Token(TT.RANGE, (t.value, tokens[i + 2].value), t.pos))
            i += 3
        else:
            folded.append(t)
            i += 1

    folded.append(Token(TT.EOF, None, len(text)))
    return folded


# ---------------------------------------------------------------------------
# Cell reference parsing
# ---------------------------------------------------------------------------

_CELL_RE = re.compile(r"^([A-Z]+)(\d+)$")


def col_letters_to_index(letters: str) -> int:
    result = 0
    for ch in letters:
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def index_to_col_letters(idx: int) -> str:
    letters = ""
    n = idx
    while True:
        letters = chr(65 + n % 26) + letters
        n = n // 26 - 1
        if n < 0:
            break
    return letters


def cell_ref_to_coord(ref: str) -> tuple[int, int]:
    m = _CELL_RE.match(ref)
    if not m:
        raise FormulaError("REF", f"Invalid cell reference: {ref}")
    col = col_letters_to_index(m.group(1))
    row = int(m.group(2)) - 1
    if row < 0 or col < 0:
        raise FormulaError("REF", f"Out-of-range cell: {ref}")
    return row, col


def range_to_coords(start: str, end: str) -> list[tuple[int, int]]:
    r1, c1 = cell_ref_to_coord(start)
    r2, c2 = cell_ref_to_coord(end)
    rs = range(min(r1, r2), max(r1, r2) + 1)
    cs = range(min(c1, c2), max(c1, c2) + 1)
    return [(r, c) for r in rs for c in cs]


# ---------------------------------------------------------------------------
# AST + Parser (Pratt)
# ---------------------------------------------------------------------------


@dataclass
class Node:
    pass


@dataclass
class Literal(Node):
    value: Any


@dataclass
class CellRefNode(Node):
    ref: str  # e.g. "A1"


@dataclass
class RangeNode(Node):
    start: str
    end: str


@dataclass
class FuncCall(Node):
    name: str
    args: list[Node]


@dataclass
class BinaryOp(Node):
    op: str
    left: Node
    right: Node


@dataclass
class UnaryOp(Node):
    op: str
    operand: Node


# Operator precedence (higher binds tighter)
_INFIX_PREC: dict[TT, int] = {
    TT.EQ: 10,
    TT.NEQ: 10,
    TT.LT: 10,
    TT.GT: 10,
    TT.LE: 10,
    TT.GE: 10,
    TT.AMP: 20,
    TT.PLUS: 30,
    TT.MINUS: 30,
    TT.MUL: 40,
    TT.DIV: 40,
    TT.POW: 50,  # right-assoc handled below
}
_UNARY_PREC = 60


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> Token:
        return self.tokens[self.pos]

    def advance(self) -> Token:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def expect(self, tt: TT) -> Token:
        t = self.advance()
        if t.type != tt:
            raise FormulaError("ERROR", f"Expected {tt.name} got {t.type.name} at {t.pos}")
        return t

    def parse(self) -> Node:
        node = self.parse_expr(0)
        if self.peek().type != TT.EOF:
            raise FormulaError("ERROR", f"Unexpected token {self.peek().value!r}")
        return node

    def parse_expr(self, min_prec: int) -> Node:
        left = self.parse_prefix()
        while True:
            tt = self.peek().type
            # Postfix percent
            if tt == TT.PCT:
                self.advance()
                left = BinaryOp("/", left, Literal(100))
                continue
            prec = _INFIX_PREC.get(tt)
            if prec is None or prec < min_prec:
                return left
            op_tok = self.advance()
            # power is right-associative
            next_min = prec + (0 if tt == TT.POW else 1)
            right = self.parse_expr(next_min)
            left = BinaryOp(op_tok.value, left, right)

    def parse_prefix(self) -> Node:
        t = self.peek()
        if t.type == TT.MINUS:
            self.advance()
            return UnaryOp("-", self.parse_expr(_UNARY_PREC))
        if t.type == TT.PLUS:
            self.advance()
            return UnaryOp("+", self.parse_expr(_UNARY_PREC))
        if t.type == TT.NUM or t.type == TT.STR or t.type == TT.BOOL:
            self.advance()
            return Literal(t.value)
        if t.type == TT.CELL:
            self.advance()
            return CellRefNode(t.value)
        if t.type == TT.RANGE:
            self.advance()
            start, end = t.value
            return RangeNode(start, end)
        if t.type == TT.LPAREN:
            self.advance()
            node = self.parse_expr(0)
            self.expect(TT.RPAREN)
            return node
        if t.type == TT.IDENT:
            name = t.value
            self.advance()
            self.expect(TT.LPAREN)
            args: list[Node] = []
            if self.peek().type != TT.RPAREN:
                args.append(self.parse_expr(0))
                while self.peek().type == TT.COMMA:
                    self.advance()
                    args.append(self.parse_expr(0))
            self.expect(TT.RPAREN)
            return FuncCall(name, args)
        raise FormulaError("ERROR", f"Unexpected token {t.value!r} at {t.pos}")


def parse(source: str) -> Node:
    return _Parser(tokenize(source)).parse()


# ---------------------------------------------------------------------------
# Reference extraction (for dependency graphs)
# ---------------------------------------------------------------------------


def extract_refs(node: Node) -> set[tuple[int, int]]:
    refs: set[tuple[int, int]] = set()

    def walk(n: Node) -> None:
        if isinstance(n, CellRefNode):
            refs.add(cell_ref_to_coord(n.ref))
        elif isinstance(n, RangeNode):
            for coord in range_to_coords(n.start, n.end):
                refs.add(coord)
        elif isinstance(n, FuncCall):
            for a in n.args:
                walk(a)
        elif isinstance(n, BinaryOp):
            walk(n.left)
            walk(n.right)
        elif isinstance(n, UnaryOp):
            walk(n.operand)

    walk(node)
    return refs


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------


def _to_number(v: Any) -> float | int:
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return v
    if v is None or v == "":
        return 0
    if isinstance(v, str):
        try:
            f = float(v)
            return int(f) if f.is_integer() else f
        except ValueError:
            raise FormulaError("VALUE", f"Cannot coerce {v!r} to number")
    raise FormulaError("VALUE", f"Cannot coerce {type(v).__name__} to number")


def _to_string(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        if v.upper() == "TRUE":
            return True
        if v.upper() == "FALSE":
            return False
        try:
            return _to_number(v) != 0
        except FormulaError:
            return v != ""
    return bool(v)


def _flatten_numbers(args: Iterable[Any]) -> list[float | int]:
    out: list[float | int] = []
    for a in args:
        if isinstance(a, list):
            for item in a:
                if item is None or item == "":
                    continue
                out.append(_to_number(item))
        else:
            if a is None or a == "":
                continue
            out.append(_to_number(a))
    return out


def _flatten_all(args: Iterable[Any]) -> list[Any]:
    out: list[Any] = []
    for a in args:
        if isinstance(a, list):
            out.extend(a)
        else:
            out.append(a)
    return out


# Function registry ---------------------------------------------------------


def _fn_sum(args):       return sum(_flatten_numbers(args))
def _fn_avg(args):
    nums = _flatten_numbers(args)
    if not nums:
        raise FormulaError("DIV/0", "AVERAGE of empty range")
    return sum(nums) / len(nums)
def _fn_min(args):
    nums = _flatten_numbers(args)
    if not nums:
        raise FormulaError("VALUE", "MIN of empty range")
    return min(nums)
def _fn_max(args):
    nums = _flatten_numbers(args)
    if not nums:
        raise FormulaError("VALUE", "MAX of empty range")
    return max(nums)
def _fn_count(args):
    return sum(1 for v in _flatten_all(args) if isinstance(v, (int, float)) or _is_numeric_str(v))
def _fn_counta(args):
    return sum(1 for v in _flatten_all(args) if v not in (None, ""))
def _fn_round(args):
    if len(args) == 1:
        return round(_to_number(args[0]))
    return round(_to_number(args[0]), int(_to_number(args[1])))
def _fn_abs(args):       return abs(_to_number(args[0]))
def _fn_int_(args):      return int(_to_number(args[0]))
def _fn_mod(args):       return _to_number(args[0]) % _to_number(args[1])
def _fn_power(args):     return _to_number(args[0]) ** _to_number(args[1])
def _fn_sqrt(args):
    n = _to_number(args[0])
    if n < 0:
        raise FormulaError("NUM", "SQRT of negative")
    return n ** 0.5
def _fn_if(args):
    cond = _truthy(args[0])
    if cond:
        return args[1]
    return args[2] if len(args) > 2 else False
def _fn_and(args):       return all(_truthy(v) for v in _flatten_all(args))
def _fn_or(args):        return any(_truthy(v) for v in _flatten_all(args))
def _fn_not(args):       return not _truthy(args[0])
def _fn_iferror(args):
    # IFERROR(value, fallback). We can't evaluate value lazily here, so any
    # FormulaError thrown during arg evaluation surfaces as #VALUE. The
    # evaluator handles IFERROR specially in evaluate_node().
    return args[0]
def _fn_concat(args):    return "".join(_to_string(v) for v in _flatten_all(args))
def _fn_left(args):      return _to_string(args[0])[: int(_to_number(args[1]))]
def _fn_right(args):
    n = int(_to_number(args[1]))
    s = _to_string(args[0])
    return s[-n:] if n > 0 else ""
def _fn_mid(args):
    s = _to_string(args[0])
    start = int(_to_number(args[1])) - 1
    length = int(_to_number(args[2]))
    return s[start : start + length]
def _fn_len(args):       return len(_to_string(args[0]))
def _fn_upper(args):     return _to_string(args[0]).upper()
def _fn_lower(args):     return _to_string(args[0]).lower()
def _fn_trim(args):      return _to_string(args[0]).strip()
def _fn_today(args):     return date.today().isoformat()
def _fn_now(args):       return datetime.utcnow().isoformat(timespec="seconds")
def _fn_sumif(args):
    rng, criterion = _flatten_all([args[0]]), args[1]
    sum_range = _flatten_all([args[2]]) if len(args) > 2 else rng
    total: float = 0.0
    for i, v in enumerate(rng):
        if _matches(v, criterion):
            if i < len(sum_range):
                total += _to_number(sum_range[i])
    return total
def _fn_countif(args):
    rng = _flatten_all([args[0]])
    criterion = args[1]
    return sum(1 for v in rng if _matches(v, criterion))
def _fn_averageif(args):
    rng = _flatten_all([args[0]])
    criterion = args[1]
    sum_range = _flatten_all([args[2]]) if len(args) > 2 else rng
    matched = [_to_number(sum_range[i]) for i, v in enumerate(rng) if _matches(v, criterion) and i < len(sum_range)]
    if not matched:
        raise FormulaError("DIV/0", "AVERAGEIF: no matches")
    return sum(matched) / len(matched)


def _is_numeric_str(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        float(v)
        return True
    except ValueError:
        return False


def _matches(value: Any, criterion: Any) -> bool:
    if isinstance(criterion, str):
        crit = criterion.strip()
        for op, fn in [
            (">=", lambda a, b: a >= b),
            ("<=", lambda a, b: a <= b),
            ("<>", lambda a, b: a != b),
            (">", lambda a, b: a > b),
            ("<", lambda a, b: a < b),
            ("=", lambda a, b: a == b),
        ]:
            if crit.startswith(op):
                target = crit[len(op):].strip()
                try:
                    return fn(_to_number(value), _to_number(target))
                except FormulaError:
                    return fn(str(value), target)
        return str(value) == crit
    if isinstance(criterion, (int, float, bool)):
        try:
            return _to_number(value) == _to_number(criterion)
        except FormulaError:
            return False
    return False


def _fn_vlookup(args):
    needle = args[0]
    table = args[1]  # expected to be a 2D list (list of lists)
    col_index = int(_to_number(args[2]))
    if not isinstance(table, list) or not table or not isinstance(table[0], list):
        raise FormulaError("VALUE", "VLOOKUP table must be a 2D range")
    for row in table:
        if row and _equals_loose(row[0], needle):
            if col_index - 1 >= len(row):
                raise FormulaError("REF", "VLOOKUP col_index out of range")
            return row[col_index - 1]
    raise FormulaError("N/A", "VLOOKUP no match")


def _equals_loose(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a == b
    try:
        return _to_number(a) == _to_number(b)
    except FormulaError:
        return _to_string(a) == _to_string(b)


def _fn_match(args):
    needle = args[0]
    table = args[1]
    match_type = int(_to_number(args[2])) if len(args) > 2 else 1
    items = _flatten_all([table])
    if match_type == 0:
        for i, v in enumerate(items):
            if _equals_loose(v, needle):
                return i + 1
        raise FormulaError("N/A", "MATCH no exact match")
    # Approximate match (1 = largest <= needle)
    last = None
    for i, v in enumerate(items):
        try:
            if _to_number(v) <= _to_number(needle):
                last = i + 1
            else:
                break
        except FormulaError:
            continue
    if last is None:
        raise FormulaError("N/A", "MATCH no value <=")
    return last


def _fn_index(args):
    table = args[0]
    row_idx = int(_to_number(args[1]))
    if isinstance(table, list) and table and isinstance(table[0], list):
        if row_idx < 1 or row_idx > len(table):
            raise FormulaError("REF", "INDEX row out of range")
        row = table[row_idx - 1]
        if len(args) > 2:
            col_idx = int(_to_number(args[2]))
            if col_idx < 1 or col_idx > len(row):
                raise FormulaError("REF", "INDEX col out of range")
            return row[col_idx - 1]
        return row
    items = _flatten_all([table])
    if row_idx < 1 or row_idx > len(items):
        raise FormulaError("REF", "INDEX out of range")
    return items[row_idx - 1]


# ROW / COLUMN are dispatched in the evaluator (need cell context for no-arg
# form and need raw AST nodes to compute the address of an unresolved cell ref).
def _fn_row(args):
    raise FormulaError("ERROR", "ROW handled by evaluator")


def _fn_column(args):
    raise FormulaError("ERROR", "COLUMN handled by evaluator")


_FUNCTIONS: dict[str, Callable[[list[Any]], Any]] = {
    "SUM": _fn_sum,
    "AVERAGE": _fn_avg,
    "AVG": _fn_avg,
    "MIN": _fn_min,
    "MAX": _fn_max,
    "COUNT": _fn_count,
    "COUNTA": _fn_counta,
    "ROUND": _fn_round,
    "ABS": _fn_abs,
    "INT": _fn_int_,
    "MOD": _fn_mod,
    "POWER": _fn_power,
    "SQRT": _fn_sqrt,
    "IF": _fn_if,
    "AND": _fn_and,
    "OR": _fn_or,
    "NOT": _fn_not,
    "IFERROR": _fn_iferror,  # special-cased in evaluator
    "CONCAT": _fn_concat,
    "CONCATENATE": _fn_concat,
    "LEFT": _fn_left,
    "RIGHT": _fn_right,
    "MID": _fn_mid,
    "LEN": _fn_len,
    "UPPER": _fn_upper,
    "LOWER": _fn_lower,
    "TRIM": _fn_trim,
    "TODAY": _fn_today,
    "NOW": _fn_now,
    "SUMIF": _fn_sumif,
    "COUNTIF": _fn_countif,
    "AVERAGEIF": _fn_averageif,
    "VLOOKUP": _fn_vlookup,
    "MATCH": _fn_match,
    "INDEX": _fn_index,
    "ROW": _fn_row,
    "COLUMN": _fn_column,
}


# ---------------------------------------------------------------------------
# Cell-value coercion (raw stored values -> typed Python)
# ---------------------------------------------------------------------------


def _coerce_cell(value: Any, data_type: str | None) -> Any:
    """Convert a stored cell into a typed Python value for use in formulas."""
    if value is None or value == "":
        return 0  # SUM/MIN treat empties as 0; truthy treats as falsy
    dt = (data_type or "").lower()
    if dt == "number":
        try:
            return _to_number(value)
        except FormulaError:
            return value
    if dt == "boolean":
        if isinstance(value, str):
            return value.strip().upper() == "TRUE"
        return bool(value)
    return value


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------


@dataclass
class GridContext:
    """Lookup helper for resolving cell references during evaluation.

    `current` is the coordinate of the cell whose formula is being evaluated;
    it's how ROW() / COLUMN() with no args resolve to "this cell".
    """

    values: dict[tuple[int, int], Any] = field(default_factory=dict)
    current: tuple[int, int] | None = None

    def get(self, coord: tuple[int, int]) -> Any:
        return self.values.get(coord, 0)


def evaluate(
    source: str | Node,
    grid: dict[tuple[int, int], Any] | GridContext,
    *,
    current: tuple[int, int] | None = None,
) -> Any:
    if isinstance(source, str):
        node = parse(source)
    else:
        node = source
    if isinstance(grid, GridContext):
        ctx = grid
        if current is not None:
            ctx.current = current
    else:
        ctx = GridContext(values=grid, current=current)
    return _eval(node, ctx)


def _eval(node: Node, ctx: GridContext) -> Any:
    if isinstance(node, Literal):
        return node.value
    if isinstance(node, CellRefNode):
        return ctx.get(cell_ref_to_coord(node.ref))
    if isinstance(node, RangeNode):
        coords = range_to_coords(node.start, node.end)
        r1, c1 = cell_ref_to_coord(node.start)
        r2, c2 = cell_ref_to_coord(node.end)
        row_lo, row_hi = min(r1, r2), max(r1, r2)
        col_lo, col_hi = min(c1, c2), max(c1, c2)
        grid_2d: list[list[Any]] = []
        for r in range(row_lo, row_hi + 1):
            row_vals: list[Any] = []
            for c in range(col_lo, col_hi + 1):
                row_vals.append(ctx.get((r, c)))
            grid_2d.append(row_vals)
        # Collapse to 1D list for single-row/column ranges (callers can re-shape)
        if len(grid_2d) == 1:
            return grid_2d[0]
        if all(len(r) == 1 for r in grid_2d):
            return [r[0] for r in grid_2d]
        return grid_2d
    if isinstance(node, UnaryOp):
        v = _eval(node.operand, ctx)
        if node.op == "-":
            return -_to_number(v)
        return _to_number(v)
    if isinstance(node, BinaryOp):
        return _eval_binary(node, ctx)
    if isinstance(node, FuncCall):
        return _eval_funccall(node, ctx)
    raise FormulaError("ERROR", f"Unknown node {type(node).__name__}")


def _eval_binary(node: BinaryOp, ctx: GridContext) -> Any:
    left = _eval(node.left, ctx)
    right = _eval(node.right, ctx)
    op = node.op
    if op == "&":
        return _to_string(left) + _to_string(right)
    if op == "+":
        return _to_number(left) + _to_number(right)
    if op == "-":
        return _to_number(left) - _to_number(right)
    if op == "*":
        return _to_number(left) * _to_number(right)
    if op == "/":
        rn = _to_number(right)
        if rn == 0:
            raise FormulaError("DIV/0", "Division by zero")
        return _to_number(left) / rn
    if op == "^":
        return _to_number(left) ** _to_number(right)
    if op == "=":
        return _equals_loose(left, right)
    if op == "<>":
        return not _equals_loose(left, right)
    if op == "<":
        return _to_number(left) < _to_number(right)
    if op == ">":
        return _to_number(left) > _to_number(right)
    if op == "<=":
        return _to_number(left) <= _to_number(right)
    if op == ">=":
        return _to_number(left) >= _to_number(right)
    raise FormulaError("ERROR", f"Unknown operator {op}")


def _eval_funccall(node: FuncCall, ctx: GridContext) -> Any:
    name = node.name.upper()
    # IFERROR — lazy fallback: don't evaluate the fallback unless the first throws
    if name == "IFERROR":
        if len(node.args) != 2:
            raise FormulaError("VALUE", "IFERROR expects 2 arguments")
        try:
            return _eval(node.args[0], ctx)
        except FormulaError:
            return _eval(node.args[1], ctx)
    # IF — short-circuit: only evaluate the taken branch (matches Excel semantics)
    if name == "IF":
        if len(node.args) not in (2, 3):
            raise FormulaError("VALUE", "IF expects 2 or 3 arguments")
        if _truthy(_eval(node.args[0], ctx)):
            return _eval(node.args[1], ctx)
        if len(node.args) == 3:
            return _eval(node.args[2], ctx)
        return False
    # ROW / COLUMN — need the AST to resolve "ROW(ref)" without dereferencing
    if name == "ROW":
        if not node.args:
            if ctx.current is None:
                raise FormulaError("VALUE", "ROW() needs a cell context")
            return ctx.current[0] + 1
        target = node.args[0]
        if isinstance(target, CellRefNode):
            return cell_ref_to_coord(target.ref)[0] + 1
        if isinstance(target, RangeNode):
            return cell_ref_to_coord(target.start)[0] + 1
        raise FormulaError("VALUE", "ROW expects a cell or range reference")
    if name == "COLUMN":
        if not node.args:
            if ctx.current is None:
                raise FormulaError("VALUE", "COLUMN() needs a cell context")
            return ctx.current[1] + 1
        target = node.args[0]
        if isinstance(target, CellRefNode):
            return cell_ref_to_coord(target.ref)[1] + 1
        if isinstance(target, RangeNode):
            return cell_ref_to_coord(target.start)[1] + 1
        raise FormulaError("VALUE", "COLUMN expects a cell or range reference")
    fn = _FUNCTIONS.get(name)
    if fn is None:
        raise FormulaError("NAME", f"Unknown function {name}")
    args = [_eval(a, ctx) for a in node.args]
    return fn(args)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def is_formula(text: str | None) -> bool:
    return bool(text) and text.lstrip().startswith("=")


def format_result(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(round(value, 10)).rstrip("0").rstrip(".") if "." in str(value) else str(value)
    return str(value)
