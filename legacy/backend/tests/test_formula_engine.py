import pytest

from app.services.formula.engine import (
    FormulaError,
    cell_ref_to_coord,
    col_letters_to_index,
    evaluate,
    extract_refs,
    format_result,
    index_to_col_letters,
    is_formula,
    parse,
    range_to_coords,
)


def test_col_letters_roundtrip():
    for idx in [0, 1, 25, 26, 27, 51, 52, 701, 702]:
        assert col_letters_to_index(index_to_col_letters(idx)) == idx


def test_cell_ref_parsing():
    assert cell_ref_to_coord("A1") == (0, 0)
    assert cell_ref_to_coord("B12") == (11, 1)
    assert cell_ref_to_coord("AA1") == (0, 26)


def test_range_coords():
    assert range_to_coords("A1", "B2") == [(0, 0), (0, 1), (1, 0), (1, 1)]


def test_is_formula():
    assert is_formula("=1+1")
    assert is_formula("  =SUM(A1:A2)")
    assert not is_formula("hello")
    assert not is_formula(None)


def test_arithmetic_and_precedence():
    assert evaluate("=1+2*3", {}) == 7
    assert evaluate("=(1+2)*3", {}) == 9
    assert evaluate("=2^3^2", {}) == 512  # right-assoc
    assert evaluate("=10%", {}) == 0.1
    assert evaluate("=-5+3", {}) == -2


def test_string_concat_and_comparison():
    assert evaluate('="hi"&" "&"there"', {}) == "hi there"
    assert evaluate("=2>1", {}) is True
    assert evaluate("=1=1", {}) is True
    assert evaluate("=1<>2", {}) is True


def test_cell_reference_lookup():
    grid = {(0, 0): 10, (0, 1): 20, (1, 0): 5}
    assert evaluate("=A1+B1", grid) == 30
    assert evaluate("=A1*A2", grid) == 50


def test_sum_min_max_avg_over_range():
    grid = {(0, 0): 1, (1, 0): 2, (2, 0): 3, (3, 0): 4}
    assert evaluate("=SUM(A1:A4)", grid) == 10
    assert evaluate("=MIN(A1:A4)", grid) == 1
    assert evaluate("=MAX(A1:A4)", grid) == 4
    assert evaluate("=AVERAGE(A1:A4)", grid) == 2.5


def test_if_and_or_not():
    assert evaluate('=IF(1>0, "yes", "no")', {}) == "yes"
    assert evaluate("=AND(TRUE, 1=1)", {}) is True
    assert evaluate("=OR(FALSE, 0)", {}) is False
    assert evaluate("=NOT(TRUE)", {}) is False


def test_text_functions():
    assert evaluate('=UPPER("hello")', {}) == "HELLO"
    assert evaluate('=LOWER("HEY")', {}) == "hey"
    assert evaluate('=LEFT("abcdef", 3)', {}) == "abc"
    assert evaluate('=RIGHT("abcdef", 2)', {}) == "ef"
    assert evaluate('=MID("abcdef", 2, 3)', {}) == "bcd"
    assert evaluate('=LEN("hello")', {}) == 5
    assert evaluate('=TRIM("  hi  ")', {}) == "hi"
    assert evaluate('=CONCAT("a","b","c")', {}) == "abc"


def test_iferror_catches():
    assert evaluate('=IFERROR(1/0, "fallback")', {}) == "fallback"
    assert evaluate("=IFERROR(1+1, 99)", {}) == 2


def test_sumif_countif_averageif():
    grid = {
        (0, 0): "a", (0, 1): 1,
        (1, 0): "b", (1, 1): 2,
        (2, 0): "a", (2, 1): 3,
    }
    assert evaluate('=SUMIF(A1:A3, "a", B1:B3)', grid) == 4
    assert evaluate('=COUNTIF(A1:A3, "a")', grid) == 2
    assert evaluate('=AVERAGEIF(A1:A3, "a", B1:B3)', grid) == 2.0
    nums = {(0, 0): 1, (1, 0): 2, (2, 0): 3, (3, 0): 4, (4, 0): 5}
    assert evaluate('=SUMIF(A1:A5, ">=3")', nums) == 12
    assert evaluate('=COUNTIF(A1:A5, "<3")', nums) == 2


def test_vlookup():
    # 2D range A1:B3
    grid = {
        (0, 0): "apple", (0, 1): 1,
        (1, 0): "banana", (1, 1): 2,
        (2, 0): "cherry", (2, 1): 3,
    }
    assert evaluate('=VLOOKUP("banana", A1:B3, 2)', grid) == 2
    with pytest.raises(FormulaError):
        evaluate('=VLOOKUP("durian", A1:B3, 2)', grid)


def test_extract_refs_includes_range_cells():
    refs = extract_refs(parse("=SUM(A1:B2) + C5"))
    assert refs == {(0, 0), (0, 1), (1, 0), (1, 1), (4, 2)}


def test_div_zero_returns_formula_error():
    with pytest.raises(FormulaError) as info:
        evaluate("=1/0", {})
    assert info.value.code == "DIV/0"


def test_unknown_function_raises_name_error():
    with pytest.raises(FormulaError) as info:
        evaluate("=BOGUS(1)", {})
    assert info.value.code == "NAME"


def test_format_result_strips_trailing_zeros():
    assert format_result(1.0) == "1"
    assert format_result(1.5) == "1.5"
    assert format_result(True) == "TRUE"
    assert format_result(None) == ""
