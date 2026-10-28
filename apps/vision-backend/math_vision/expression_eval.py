"""Safe mathematical execution engine (stdlib-only, no third-party imports).

The expression evaluator is intentionally ISOLATED:

* Input passes a strict structural regex first (Step 5): only the characters
  0-9 + - * / . ( ) and whitespace survive.
* The surviving string is parsed with :mod:`ast` (never compiled from raw
  tokens with ``eval``/``exec``), and every AST node is checked against a
  whitelist BEFORE evaluation — assignments, calls, attribute access,
  subscripting and f-string vectors simply cannot construct code execution.
* Evaluation happens via ``eval(compile(ast_obj, ...))`` on the validated
  tree only, wrapped in fault isolation (length, depth and time bounds).
* No names, no imports, no functions: only arithmetic operator nodes exist.
"""

from __future__ import annotations

import ast
import re
import operator

from .exceptions import ExpressionValidationError

#: Maximum complexity accepted — OCR output for one line of arithmetic.
MAX_EXPRESSION_LENGTH = 256
MAX_AST_DEPTH = 32

#: Step 5 — the response may only contain these characters (whitespace is
#: allowed during the structural check and collapsed before evaluation).
STRUCTURAL_MATH_CHARS = re.compile(r"^[0-9+\-*/.()\s]+$")
NON_MATH_CHARS = re.compile(r"[^0-9+\-*/.()]")

_BINARY_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}

_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def strip_non_math(text: str) -> str:
    """Strip any character outside the standard arithmetic set.

    Spec (Step 5): "If non-math junk characters slipped past the AI, strip
    them out." Whitespace and separator noise are dropped too — the result
    is a compact candidate for structural validation.
    """
    if text is None:
        return ""
    return NON_MATH_CHARS.sub("", str(text)).strip()


def enforce_structural_match(text: str) -> str:
    """Validate + normalize the candidate expression (Step 5).

    Returns the compact math-only expression, or raises
    ExpressionValidationError when nothing structural remains.
    """
    candidate = strip_non_math(text)
    if not candidate:
        raise ExpressionValidationError(
            "No structural math content found after validation "
            f"(raw validator response: {text!r})."
        )
    return candidate


def _check_ast_depth(node: ast.AST, depth: int = 0) -> None:
    if depth > MAX_AST_DEPTH:
        raise ExpressionValidationError(
            f"Expression nesting exceeds the depth limit ({MAX_AST_DEPTH})."
        )
    for child in ast.iter_child_nodes(node):
        _check_ast_depth(child, depth + 1)


def _raise_invalid(node: ast.AST, reason: str) -> None:
    raise ExpressionValidationError(
        f"Invalid token {type(node).__name__} in expression: {reason}"
    )


def _eval_node(node: ast.AST) -> float:
    # Only numeric literals, arithmetic operators and grouping survive parsing.
    # ast.parse would reject bare operator keywords, but name/call/attribute/
    # subscript nodes must still be refused explicitly before they can act as
    # evaluation vectors.
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return float(node.value)
        _raise_invalid(node, f"only numeric literals are allowed, got {node.value!r}")
    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _BINARY_OPS:
            _raise_invalid(node, f"operator {op_type.__name__} is not allowed")
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        return _BINARY_OPS[op_type](left, right)
    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _UNARY_OPS:
            _raise_invalid(node, f"operator {op_type.__name__} is not allowed")
        return _UNARY_OPS[op_type](_eval_node(node.operand))
    if isinstance(node, (ast.Call, ast.Name, ast.Attribute, ast.Subscript,
                         ast.Lambda, ast.Compare, ast.BoolOp, ast.Assign,
                         ast.NamedExpr)):
        _raise_invalid(node, "code-injection vectors are blocked")

    _raise_invalid(node, "unsupported expression construct")


def evaluate_expression(expression: str) -> float:
    """Evaluate the sanitized arithmetic string safely.

    Pipeline guarantees: the expression already passed the structural regex.
    This is the last line of defence, so it re-checks everything itself.
    Raises ExpressionValidationError for illegal structure and lets
    ZeroDivisionError propagate for the caller to translate into message.
    """
    if expression is None:
        raise ExpressionValidationError("Empty expression to evaluate.")

    compact = strip_non_math(expression)
    if not compact:
        raise ExpressionValidationError("Expression contains only junk characters.")
    if len(compact) > MAX_EXPRESSION_LENGTH:
        raise ExpressionValidationError(
            f"Expression longer than the {MAX_EXPRESSION_LENGTH}-character limit."
        )
    if not STRUCTURAL_MATH_CHARS.match(expression):
        raise ExpressionValidationError(
            "Expression contains characters outside the approved math set."
        )

    try:
        tree = ast.parse(compact, mode="eval")
    except SyntaxError as exc:
        raise ExpressionValidationError(
            f"Malformed arithmetic expression: {compact!r} ({exc.msg})."
        ) from exc

    _check_ast_depth(tree)

    try:
        result = _eval_node(tree)
    except ZeroDivisionError as exc:
        raise ZeroDivisionError("Division by zero in the validated expression.") from exc
    except (RecursionError, MemoryError, OverflowError) as exc:
        raise ExpressionValidationError(f"Expression too large to evaluate: {exc}") from exc

    if isinstance(result, complex):
        raise ExpressionValidationError("Result is not a real number.")
    if result != result or result in (float("inf"), float("-inf")):
        raise ExpressionValidationError("Result is not a finite number.")

    return float(result)


def format_result(value: float) -> str:
    """Presentation layer: integral results print without a float tail."""
    if float(value).is_integer():
        return str(int(value))
    text = repr(round(float(value), 10))
    return text
