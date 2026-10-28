/**
 * Question-complexity gate.
 *
 * Classic arithmetic is always evaluated locally (deterministic, free,
 * offline). Gemini solving activates when the question is genuinely harder
 * than a calculator tap: too long, too deeply nested, or containing word
 * content the expression engine has no concept of.
 *
 * Pure and unit tested; the auto-attempt combines this gate with "the local
 * evaluation failed" so a simple misread digit stays a manual correction
 * instead of a model call.
 */

/** Above this length the evaluator display gets unwieldy and OCR error-prone. */
export const MAX_SIMPLE_LENGTH = 60;

/** Paren depth beyond this is more than a phone-photo calculation. */
export const MAX_SIMPLE_DEPTH = 4;

/** Math functions/constants the expression engine understands. */
const SUPPORTED_WORDS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'ln', 'log', 'log10', 'log2', 'exp', 'abs',
  'round', 'floor', 'ceil', 'min', 'max', 'factorial', 'ncr',
  'pi', 'ans', 'e', 'x', 'of',
]);

export interface ComplexityAssessment {
  complex: boolean;
  reasons: string[];
}

export function nestingDepth(text: string): number {
  let depth = 0;
  let max = 0;
  for (const char of text) {
    if (char === '(') {
      depth += 1;
      if (depth > max) max = depth;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

/** Words (2+ letters) the expression engine does not know, or null. */
export function findUnknownWord(text: string): string | null {
  const words = text.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  for (const word of words) {
    if (!SUPPORTED_WORDS.has(word)) return word;
  }
  return null;
}

export function assessComplexity(
  text: string,
  localEvalFailed: boolean = false
): ComplexityAssessment {
  const reasons: string[] = [];
  if (text.length > MAX_SIMPLE_LENGTH) {
    reasons.push(`longer than ${MAX_SIMPLE_LENGTH} characters`);
  }
  const depth = nestingDepth(text);
  if (depth > MAX_SIMPLE_DEPTH) {
    reasons.push(`nesting depth of ${depth} levels`);
  }
  const unknownWord = findUnknownWord(text);
  if (unknownWord) {
    reasons.push(`word content ("${unknownWord}")`);
  }
  if (localEvalFailed && reasons.length > 0) {
    reasons.push('local evaluation failed');
  }
  return { complex: reasons.length > 0, reasons };
}
