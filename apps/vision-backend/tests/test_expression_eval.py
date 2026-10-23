"""Offline unit tests for the isolated execution engine (Step 5/6)."""

import pytest

from math_vision.exceptions import ExpressionValidationError
from math_vision.expression_eval import (
    enforce_structural_match,
    evaluate_expression,
    format_result,
    strip_non_math,
)


class TestStripNonMath:
    def test_keeps_math_characters(self):
        assert strip_non_math("12+25") == "12+25"

    def test_strips_conversational_filler(self):
        # letters/words are dropped; math characters (incl. '.' and grouping)
        # survive the strip — leftovers are caught by the structural gate
        assert strip_non_math("The answer is: (12+25). Thank you!") == "(12+25)."
        with pytest.raises(ExpressionValidationError):
            evaluate_expression("(12+25).")

    def test_strips_markdown_noise(self):
        # '*' is a math char so the strip keeps it; the raw double-star case
        # is rejected by the structural/parsing gate.
        assert strip_non_math("**12+25**") == "**12+25**"
        with pytest.raises(ExpressionValidationError):
            evaluate_expression("**12+25**")

    def test_strips_injection_survivors(self):
        # only inert grouping characters remain — never valid enough to run
        assert strip_non_math("__import__('os').system('ls')") == "().()"

    def test_empty_input(self):
        assert strip_non_math(None) == ""
        assert strip_non_math("") == ""


class TestEnforceStructuralMatch:
    def test_passes_clean_expression_through(self):
        assert enforce_structural_match("12+25") == "12+25"

    def test_strips_junk_and_returns_survivor(self):
        assert enforce_structural_match("12 + 25 =   37?") == "12+2537"

    def test_raises_when_nothing_structural_remains(self):
        with pytest.raises(ExpressionValidationError) as excinfo:
            enforce_structural_match("sorry, I cannot read that")
        assert excinfo.value.step == 5


class TestEvaluateExpression:
    @pytest.mark.parametrize(
        ("expression", "expected"),
        [
            ("12+25", 37.0),
            ("3*4-5", 7.0),
            ("(8+2)/5", 2.0),
            ("7.5*2", 15.0),
            ("-3+10", 7.0),
            ("2*(3+4)-(1+2)", 11.0),
            ("((2+3))", 5.0),
        ],
    )
    def test_valid_arithmetic(self, expression, expected):
        assert evaluate_expression(expression) == pytest.approx(expected)

    def test_division_by_zero_propagates(self):
        with pytest.raises(ZeroDivisionError):
            evaluate_expression("5/0")

    @pytest.mark.parametrize(
        "expression",
        [
            "__import__('os').system('ls')",
            "().__class__.__mro__",
            "open('/etc/passwd')",
            "exec('1')",
            "lambda: 1",
            "1 if True else 2",
            "os",
            "1' OR '1'='1",
        ],
    )
    def test_injection_vectors_blocked(self, expression):
        with pytest.raises(ExpressionValidationError):
            evaluate_expression(expression)

    def test_pow_not_in_allowed_set(self):
        # The spec restricts the operator set to + - * / — exponent vectors
        # (huge-number DoS) are rejected at the structural gate.
        with pytest.raises(ExpressionValidationError):
            evaluate_expression("9**9999")

    def test_oversized_expression_rejected(self):
        with pytest.raises(ExpressionValidationError):
            evaluate_expression("1+" * 200 + "1")

    def test_non_numeric_literal_rejected(self):
        with pytest.raises(ExpressionValidationError):
            evaluate_expression("'a'+1")


class TestFormatResult:
    def test_integral_results_have_no_float_tail(self):
        assert format_result(37.0) == "37"
        assert format_result(-4.0) == "-4"

    def test_fractional_results_keep_decimals(self):
        assert format_result(4 * 5 ** 0) == "4"
        assert format_result(1 / 3) == str(round(1 / 3, 10))
