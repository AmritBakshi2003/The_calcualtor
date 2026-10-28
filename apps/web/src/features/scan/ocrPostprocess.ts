/**
 * OCR Postprocessing Functions
 * Normalize Unicode operators and common OCR misreads
 */

import { textShapeScore } from './ocrScoring';

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
 * Check if a character is in a digit position (safe to substitute).
 *
 * A look-alike letter counts as a digit when its whole token contains a digit
 * ("1O5", "2S3") or when it stands alone between operators ("O + 2"). Being at
 * a token boundary is NOT enough: that turned the word "Order" into "0rder",
 * so a receipt line lost its text and produced an unparsable expression.
 */
function isDigitPosition(text: string, index: number): boolean {
  const char = text[index];
  if (/[0-9]/.test(char)) return true;

  let start = index;
  let end = index;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length - 1 && !/\s/.test(text[end + 1])) end++;

  const token = text.slice(start, end + 1);
  if (/[0-9]/.test(token)) return true;

  return token.length === 1 && (DIGIT_LOOKALIKES.includes(char) || SUBSTITUTIONS[char] !== undefined);
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
 * Strip stray characters that are not part of mathematical expressions.
 *
 * "√" and "π" are real mathematical symbols OCR emits for radicals and pi;
 * deleting them merely because the arithmetic whitelist does not name them
 * silently CHANGES the expression ("4√5" would become "45" and evaluate to
 * the wrong number). They are kept here and mapped by `cleanForEvaluation`.
 * Anything else unfamiliar (words, currency glyphs, ...) is dropped — the
 * evaluator otherwise rejects the whole line.
 */
function stripStrayCharacters(text: string): string {
  // Keep only valid mathematical expression characters
  return text.replace(/[^0-9+\-*/×÷().,=^%√π\s]/g, '');
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
/**
 * Which ambiguous characters this raw OCR text WOULD have auto-substituted
 * ("1O5" -> "105", standalone "O + 2" -> "0 + 2"). The scanner shows these to
 * the user so a silent O→0 / l→1 correction cannot hide a misread without a
 * warning. Mirrors `applySafeSubstitutions` exactly; pure and unit tested.
 */
export function ambiguousSubstitutions(raw: string): string[] {
  const replaced: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    // Report only the letter/pipe look-alikes ("×"→"*", "÷"→"/", "−"→"-"
    // are deliberate Unicode mappings, not uncertain recognitions; "x" is a
    // multiplication-in-context mapping covered by the same rule).
    const substitution = SUBSTITUTIONS[char];
    if (substitution === undefined || !DIGIT_LOOKALIKES.includes(char)) continue;
    if (isDigitPosition(raw, i) && !replaced.includes(`${char}→${substitution}`)) {
      replaced.push(`${char}→${substitution}`);
    }
  }
  return replaced;
}

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
 * Multi-line input uses the line that looks most like an expression. Picking the
 * first line with a digit is not enough: a date or a price on the line above the
 * expression would win, and "12/03/2025" even evaluates as a division.
 */
export function cleanForEvaluation(text: string): string {
  if (!text) return '';

  // A pure "π²" or "√(16)" line carries no digit; the symbol lines are the
  // expression just as much as a digit line is.
  const lines = text.split(/\r?\n/).filter((l) => /[0-9√π]/.test(l));
  const line = pickExpressionLine(lines);
  // Also handle text typed straight into the edit box (no postprocessOCR run):
  // "2x3" must not reach the evaluator as a symbol named x.
  let s = normalizeOperators(line).replace(/(\d)\s*[xX]\s*(?=[\d(.])/g, '$1*');

  // Radical and constant glyphs from OCR (kept by postprocessOCR):
  //   "√9"      -> "sqrt(9)"
  //   "√(16)-2" -> "sqrt(16)-2"
  //   "π"       -> "pi"   ("2π" -> "2*pi", "π(1+2)" -> "pi*(1+2)")
  // Stripping these instead would silently change the expression's value.
  s = s.replace(/√\s*\(/g, 'sqrt(');
  s = s.replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  s = s.replace(/√/g, ''); // an unreadable fragment: drop, the evaluator's error is clearer
  // Exponent superscripts become the caret operator the evaluator supports
  // (mathjs maps "^" to pow). The base keeps its grouping so a multi-digit,
  // decimal or parenthesized base stays one operand: "2²" -> "(2)^2",
  // "(2+3)²" -> "(2+3)^2", "π²" -> "(pi)^2". Runs after the √ mapping so
  // "√9²" walks out as "sqrt(9)^2", and before the π->pi mapping so "π²"
  // wraps cleanly.
  s = s.replace(/\)²/g, ')^2');
  s = s.replace(/\)³/g, ')^3');
  s = s.replace(/(\d+(?:\.\d+)?|[a-zπ])²/g, '($1)^2');
  s = s.replace(/(\d+(?:\.\d+)?|[a-zπ])³/g, '($1)^3');
  s = s.replace(/π/g, 'pi');
  // math.js-style implicit multiplication is not part of the evaluator's
  // grammar, so insert the explicit operator where OCR geometry implies it.
  s = s.replace(/([\d)])\s*(?=sqrt\()/g, '$1*');
  s = s.replace(/([\d)])\s*pi\b/g, '$1*pi');
  s = s.replace(/pi\s*\(/g, 'pi*('); // "π(1+2)" meant multiplication, not a call
  s = s.replace(/pi\s*(?=[\d(.])/g, 'pi*');

  // Keep the first non-empty segment around "=" ("2+3=5" -> "2+3", "= 2+3" -> "2+3")
  s = s.split('=').map((part) => part.trim()).find((part) => part.length > 0) ?? '';

  // "1,000" is a thousands separator; any other "d,d" is a decimal comma
  while (/(\d),(\d{3})(?!\d)/.test(s)) {
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  }
  s = s.replace(/(\d),(\d)/g, '$1.$2').replace(/,/g, '');

  s = s.replace(/\s+/g, ' ').trim();

  // A percent sign is only meaningful after a number. OCR inserts one where a
  // small glyph (often the dot of "=") sat next to an operator: "0.5*%8" -> "0.5*8".
  s = s.replace(/([+\-*/^(])\s*%/g, '$1').replace(/^%+/, '');

  // "%" printed BETWEEN two numbers is a misread "×" (they look alike at low
  // resolution): "12.5%4" would silently evaluate as modulo 0.5.
  s = s.replace(/(\d)\s*%\s*(?=[\d(.])/g, '$1*');

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
 * Choose the line most likely to be the expression the user pointed at.
 * Ties keep document order so predictable input stays predictable. */
function pickExpressionLine(lines: string[]): string {
  if (lines.length <= 1) return lines[0] ?? '';

  let best = lines[0];
  let bestScore = textShapeScore(best);
  for (const line of lines.slice(1)) {
    const score = textShapeScore(line);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  return best;
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
