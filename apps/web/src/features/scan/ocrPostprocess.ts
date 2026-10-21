/**
 * OCR Postprocessing Functions
 * Normalize Unicode operators and common OCR misreads
 */

/**
 * Character substitution mappings for common OCR errors
 */
const SUBSTITUTIONS: Record<string, string> = {
  'O': '0',
  'o': '0',
  'l': '1',
  'I': '1',
  '|': '1',
  'S': '5',
  's': '5',
  'B': '8',
  'x': '*',
  'X': '*',
  '−': '-',
  '–': '-',
  '—': '-',
  '×': '*',
  '÷': '/',
};

/**
 * Letters Tesseract commonly confuses with digits (see SUBSTITUTIONS).
 */
const DIGIT_LOOKALIKES = 'OolI|SsB';

function isDigitLike(char: string): boolean {
  return /[0-9]/.test(char) || (char !== '' && DIGIT_LOOKALIKES.includes(char));
}

/**
 * True when an x/X sits between two operands, i.e. it is a multiplication sign
 * ("2x3", "2 x 3", "(1+2)x4"). Without this, "2x3" lost its operator and was
 * silently turned into "23".
 */
function isMultiplicationX(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd().slice(-1);
  const after = text.slice(index + 1).trimStart().charAt(0);
  return /[0-9)]/.test(before) && /[0-9(.]/.test(after);
}

/**
 * Check if a character is in a digit position (safe to substitute)
 * This is a heuristic: positions next to operators, boundaries, or other
 * digit-like characters. Neighbouring digits count too: in "1O5" the O must
 * become 0, not be dropped (which silently changed 105 into 15).
 */
function isDigitPosition(text: string, index: number): boolean {
  const char = text[index];
  const prev = text[index - 1] || '';
  const next = text[index + 1] || '';

  // Character is already a digit
  if (/[0-9]/.test(char)) return true;

  const operators = '+-*/×÷^().,= ';
  const isPrevOperator = prev === '' || operators.includes(prev);
  const isNextOperator = next === '' || operators.includes(next);

  return isPrevOperator || isNextOperator || isDigitLike(prev) || isDigitLike(next);
}

/**
 * Apply character substitutions only in safe digit positions
 */
function applySafeSubstitutions(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if ((char === 'x' || char === 'X') && isMultiplicationX(text, i)) {
      result += '*';
      continue;
    }

    const substitution = SUBSTITUTIONS[char];

    if (substitution && isDigitPosition(text, i)) {
      result += substitution;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Strip stray characters that are not part of mathematical expressions
 */
function stripStrayCharacters(text: string): string {
  // Keep only valid mathematical expression characters
  return text.replace(/[^0-9+\-*/×÷().,=^%\s]/g, '');
}

/**
 * Normalize Unicode operators to ASCII equivalents
 */
function normalizeOperators(text: string): string {
  return text
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
}

/**
 * Main postprocessing function
 */
export function postprocessOCR(text: string): string {
  if (!text) return '';

  // Normalize operators first
  let result = normalizeOperators(text);

  // Apply safe character substitutions
  result = applySafeSubstitutions(result);

  // Strip stray characters
  result = stripStrayCharacters(result);

  // Trim whitespace
  result = result.trim();

  return result;
}

/**
 * Get character-level confidence scores from Tesseract result
 */
export function getCharConfidences(result: Tesseract.RecognizeResult): number[] {
  const confidences: number[] = [];
  const lines = result.data.lines || [];

  for (const line of lines) {
    const words = line.words || [];
    for (const word of words) {
      const symbols = word.symbols || [];
      for (const symbol of symbols) {
        confidences.push(symbol.confidence || 0);
      }
    }
  }

  return confidences;
}

/**
 * Find indices of low-confidence characters (below threshold)
 */
export function findLowConfidenceIndices(confidences: number[], threshold: number = 60): number[] {
  const lowIndices: number[] = [];
  for (let i = 0; i < confidences.length; i++) {
    if (confidences[i] < threshold) {
      lowIndices.push(i);
    }
  }
  return lowIndices;
}

/**
 * Turn recognized (or user-edited) text into something the expression
 * evaluator accepts. Kept separate from `postprocessOCR` so that function still
 * preserves "=" and other characters verbatim.
 *
 * Fixes the inputs math.js rejects even though they look fine on screen:
 *  - "2+3=" / "2+3=5"  -> "2+3"        (math.js treats "=" as assignment)
 *  - "1,000+5"         -> "1000+5"     (thousands separator)
 *  - "2,5+1"           -> "2.5+1"      (decimal comma)
 *  - "2+3+" / "2+("    -> "2+3" / "2"  (dangling operator)
 *  - "(2+3"            -> "(2+3)"      (missing closing parenthesis)
 *  - "×" "÷" "−"       -> "*" "/" "-"  (also when typed by the user)
 * Multi-line input uses the first line that contains a digit.
 */
export function cleanForEvaluation(text: string): string {
  if (!text) return '';

  const line = text.split(/\r?\n/).find((l) => /[0-9]/.test(l)) ?? '';
  let s = normalizeOperators(line);

  // Keep the first non-empty segment around "=" ("2+3=5" -> "2+3", "= 2+3" -> "2+3")
  s = s.split('=').map((part) => part.trim()).find((part) => part.length > 0) ?? '';

  // "1,000" is a thousands separator; any other "d,d" is a decimal comma
  while (/(\d),(\d{3})(?!\d)/.test(s)) {
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  }
  s = s.replace(/(\d),(\d)/g, '$1.$2').replace(/,/g, '');

  s = s.replace(/\s+/g, ' ').trim();

  // Dangling operators / open parenthesis at the end, and operators that cannot start an expression
  s = s.replace(/[\s+\-*/^.(]+$/, '');
  s = s.replace(/^[\s*/^.%]+/, '');

  // Balance parentheses: drop unmatched ")" then close any open "("
  let depth = 0;
  let balanced = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') {
      if (depth === 0) continue;
      depth--;
    }
    balanced += ch;
  }
  return balanced + ')'.repeat(depth);
}

/**
 * Confidences for only the symbols that can survive postprocessing (digits,
 * operators, and the letters mapped to digits). Noise glyphs that get stripped
 * no longer inflate the "characters need attention" count.
 */
export function getKeptSymbolConfidences(result: Tesseract.RecognizeResult): number[] {
  const kept: number[] = [];
  const lines = result.data.lines || [];

  for (const line of lines) {
    for (const word of line.words || []) {
      for (const symbol of word.symbols || []) {
        const char = (symbol.text || '').trim();
        if (char.length === 1 && /[0-9+\-−–—*/×÷().,=^%xXOolI|SsB]/.test(char)) {
          kept.push(symbol.confidence || 0);
        }
      }
    }
  }

  return kept;
}
