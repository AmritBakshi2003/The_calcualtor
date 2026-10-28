/**
 * Smart input for the calculator keypad.
 *
 * Buttons append wholesale today, so trivially reachable mistakes like
 * `5++`, `×÷`, `()` or a second `.` in one number sit in the expression and
 * fail at evaluation with a cryptic message. appendSmart applies the same
 * rules a phone keypad expects, character by character:
 *
 *  - a binary operator (`+ * / ^ -`) after another operator replaces it
 *    (`5+*` → `5*`) and is refused on an empty expression;
 *  - `-` still works as a sign after `(` or at the start (`(-` stays `(-`);
 *  - `.` is refused inside a number that already has one and becomes `0.`
 *    when the current token is empty or not a number (`sin(` → `sin(0.`);
 *  - `)` is refused right after `(` or an operator;
 *  - a digit after `)` gains an implicit multiplication (`)` + `3` → `)*3`.
 *
 * Multi-character inserts (function tokens, pasted text) pass through
 * untouched. Pure and dependency-free so it is trivially unit testable.
 */

const BINARY_OPS = '+*/^';
const OPERATORS = BINARY_OPS + '-';

/** Replace a trailing operator when an operator is pressed again. */
function operatorAfterOperator(prev: string, value: string): string {
  const last = prev.slice(-1);
  if (OPERATORS.includes(last) || last === '%') {
    return prev.slice(0, -1) + value;
  }
  return prev + value;
}

/** The number token currently being typed (text after the last operator). */
function currentToken(prev: string): string {
  const match = /(?:[+\-*/^(%]|^)([^+\-*/^(%]*)$/.exec(prev);
  return match ? match[1] : '';
}

export function appendSmart(prev: string, value: string): string {
  // Multi-character tokens (function inserts, recall, paste) are trusted.
  if (value.length !== 1) return prev + value;

  if (/[0-9]/.test(value)) {
    // "(5)" + "3" means multiplication, but "5", "sin(" stay untouched.
    if (prev.endsWith(')')) return prev + '*' + value;
    return prev + value;
  }

  switch (value) {
    case '+':
    case '*':
    case '/':
    case '^': {
      if (prev === '' || prev.endsWith('(')) return prev;
      return operatorAfterOperator(prev, value);
    }
    case '-': {
      // A sign at the start or right after "(" keeps its negation meaning;
      // otherwise an operator pressed after an operator replaces it (5+- -> 5-).
      if (prev === '' || prev.endsWith('(')) return prev + value;
      return operatorAfterOperator(prev, value);
    }
    case '.': {
      if (prev.endsWith('.')) return prev;
      const token = currentToken(prev);
      if (token.includes('.')) return prev;
      if (token === '' || !/[0-9]/.test(token[token.length - 1])) {
        return prev + '0.';
      }
      return prev + value;
    }
    case ')': {
      if (prev === '') return prev;
      const last = prev.slice(-1);
      if (last === '(' || OPERATORS.includes(last) || last === '%') return prev;
      // Ignore surplus close parens: ")" alone would evaluate "-)" later.
      const opens = (prev.match(/\(/g) || []).length;
      const closes = (prev.match(/\)/g) || []).length;
      if (closes >= opens) return prev;
      return prev + value;
    }
    default:
      return prev + value;
  }
}
