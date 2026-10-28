/**
 * Display formatting for the calculator expression line.
 *
 * The evaluator's function names are internal (`atan`, `asin`, …); the
 * buttons are labelled `tan⁻¹`, `sin⁻¹`, … This formatter rewrites the
 * internal names back to their button labels for display only — the stored
 * expression still evaluates with the internal names.
 */

/** Internal evaluator name -> display label for inverse functions. */
const FUNCTION_LABELS: ReadonlyArray<[RegExp, string]> = [
  [/\batan\(/g, 'tan⁻¹('],
  [/\basin\(/g, 'sin⁻¹('],
  [/\bacos\(/g, 'cos⁻¹('],
  [/\batanh\(/g, 'tanh⁻¹('],
  [/\basinh\(/g, 'sinh⁻¹('],
  [/\bacosh\(/g, 'cosh⁻¹('],
  [/\bcbrt\(/g, '³√('],
  [/\bsqrt\(/g, '√('],
];

/** Format an expression for display; pure, order matters (longest first). */
export function formatExpressionForDisplay(expression: string): string {
  let formatted = expression;
  for (const [pattern, label] of FUNCTION_LABELS) {
    formatted = formatted.replace(pattern, label);
  }
  return formatted;
}
