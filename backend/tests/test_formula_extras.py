import pytest

from app.services.formula.engine import FormulaError, evaluate


def test_row_no_arg_uses_current_cell_context():
    assert evaluate("=ROW()", {}, current=(4, 2)) == 5


def test_column_no_arg_uses_current_cell_context():
    assert evaluate("=COLUMN()", {}, current=(4, 2)) == 3


def test_row_with_cellref():
    assert evaluate("=ROW(B7)", {}) == 7


def test_column_with_cellref():
    assert evaluate("=COLUMN(D2)", {}) == 4


def test_row_with_range_uses_start():
    assert evaluate("=ROW(A3:C9)", {}) == 3


def test_if_short_circuits_unevaluated_branch():
    # The false branch divides by zero — if it were evaluated, IF would raise.
    assert evaluate('=IF(TRUE, "yes", 1/0)', {}) == "yes"
    assert evaluate('=IF(FALSE, 1/0, "no")', {}) == "no"


def test_if_two_arg_returns_false_when_condition_false():
    assert evaluate("=IF(FALSE, 1)", {}) is False


def test_iferror_still_lazy_after_optimization():
    assert evaluate('=IFERROR(1/0, "fallback")', {}) == "fallback"


def test_row_no_arg_without_context_raises():
    with pytest.raises(FormulaError):
        evaluate("=ROW()", {})


def test_column_no_arg_without_context_raises():
    with pytest.raises(FormulaError):
        evaluate("=COLUMN()", {})
