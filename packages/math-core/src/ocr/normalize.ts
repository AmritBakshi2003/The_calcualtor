/**
 * Normalized scan alphabet and OCR output cleaner, shared by the browser
 * scanner and the Worker's OCR.space engine — one implementation, no
 * duplicates.
 *
 * The exact same string is BOTH the Tesseract character whitelist (browser
 * scanner, `apps/web/src/features/scan/useOCRWorker.ts`) and the alphabet
 * `normalize()` cleans raw recognizer output down to, so the recognizer and
 * the cleaner can never drift apart.
 *
 * One alphabet, one source of truth. `normalize()` maps look-alikes onto it:
 * x/X/* -> "×", look-alikes of ÷ -> "÷". Anything outside the string is
 * DROPPED, but never silently any more: `normalizeWithWarnings()` also
 * returns every dropped character so callers can mark the reading UNVERIFIED
 * and tell the user which symbols were not recognized (scanner P2 fix —
 * dropping a character silently can change the value: "12+3¤5" -> "12+35").
 * `normalize()` keeps its old signature for existing callers.
 */
export const SCAN_WHITELIST = '0123456789+-×÷*/().=x√π²³^';

/**
 * Look-alike mapping applied BEFORE the whitelist filter, so a misread glyph
 * lands on the arithmetic character it stood for instead of being dropped
 * (dropping silently changes the value: "2−3" -> "23").
 *
 *  - x / X / * are multiplication in a calculator expression; "*" is mapped
 *    to the display form "×" so candidates read the way the user wrote them
 *    (the evaluator still accepts both via cleanForEvaluation).
 *  - Multiplication dots and asterisk look-alikes ("·", "∙", "⋅", "∗"):
 *    some calculators print a middle dot as the multiplication sign, and at
 *    low resolution an asterisk and a dot are frequently the same mark.
 *  - "÷" look-alikes: the Unicode division slash (U+2215), the fraction
 *    slash (U+2044), and the colon, which printed ratios and some calculators
 *    use for division. A time like "9:41" becomes "9÷41", but candidate
 *    scoring penalises clock-shaped raw text, so the real expression wins.
 *  - minus look-alikes: en/em dashes and the Unicode minus sign.
 */
const CHAR_MAP: Record<string, string> = {
  'x': '×',
  'X': '×',
  '*': '×',
  '·': '×',
  '∙': '×',
  '⋅': '×',
  '∗': '×',
  '∕': '÷',
  '⁄': '÷',
  ':': '÷',
  '−': '-',
  '–': '-',
  '—': '-',
};

/** Operators that cannot appear twice in a row ("^" included: "2^^3"). */
const OPERATORS = '+-×÷*/^';

/** Exponent superscripts: postfix, need a completed operand before them, and
 *  can END an expression ("2²"). The caret ("^") may also appear between two
 *  operands but never ends one ("2^" is unfinished). */
const EXPONENT_SUFFIXES = '²³';

/** The radical sign is a prefix: it may sit anywhere an operand may start. */
const RADICAL = '√';

/**
 * Turn raw OCR text into a clean candidate expression and the list of
 * characters that were dropped along the way:
 *
 *  1. map look-alike characters onto the scan alphabet,
 *  2. drop every character outside SCAN_WHITELIST (whitespace and the ","
 *     thousands separator fold away silently — presentation, not content;
 *     every OTHER dropped character is reported in `dropped`,
 *     first-appearance order),
 *  3. remove all whitespace,
 *  4. strip trailing "=" (a printed result marker on calculator screens),
 *  5. validate: balanced brackets, no two operators in a row, and the shape
 *     rules below.
 *
 * Pure; `expression` is null for empty, junk, or structurally invalid input,
 * and `dropped` is non-empty exactly when a character could not be accounted
 * for as a look-alike, separator, or presentation. Callers must treat a
 * reading with a non-empty `dropped` as UNVERIFIED.
 */
export interface NormalizeResult {
  expression: string | null;
  /** Characters dropped from the raw text to produce `expression`. */
  dropped: string[];
}

export function normalizeWithWarnings(text: string): NormalizeResult {
  if (!text) return { expression: null, dropped: [] };

  const dropped: string[] = [];
  let out = '';
  for (const char of text) {
    const mapped = CHAR_MAP[char];
    if (mapped) {
      out += mapped;
      continue;
    }
    if (SCAN_WHITELIST.includes(char)) {
      out += char;
      continue;
    }
    if (/\s/.test(char) || char === ',') {
      // Presentation: whitespace and the digit-group separator fold away.
      continue;
    }
    if (!dropped.includes(char)) dropped.push(char);
  }

  // Whitespace is presentation.
  let cleaned = out.replace(/\s+/g, '');

  // Calculator screens print an "=" after the expression ("2+3="); it marks
  // the result, it is not an operator. Strip trailing markers only.
  cleaned = cleaned.replace(/=+$/, '');

  if (cleaned.length === 0) return { expression: null, dropped };

  if (!validShape(cleaned)) return { expression: null, dropped };

  return { expression: cleaned, dropped };
}

/**
 * Shape check used by normalizeWithWarnings:
 *  - starts with a digit, "(", or √ (the radical opens an operand);
 *  - ends with a digit, ")", "²", or "³" (exponents close an operand; a
 *    trailing caret is unfinished);
 *  - brackets balance and never close before opening;
 *  - no two flow operators in a row ("2+-3", "2^^3");
 *  - "²/³" always follows a completed operand, never an operator or another
 *    exponent ("2+²", "2^²", "2²²" are rejected).
 */
function validShape(cleaned: string): boolean {
  if (!/[0-9(]/.test(cleaned[0]) && cleaned[0] !== RADICAL) return false;
  const last = cleaned[cleaned.length - 1];
  // π may end an expression ("√9+π") — it is a constant, not an operator.
  if (!/[0-9)]/.test(last) && !EXPONENT_SUFFIXES.includes(last) && last !== 'π') return false;

  let depth = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth < 0) return false;
    }
    if (i > 0 && OPERATORS.includes(char) && OPERATORS.includes(cleaned[i - 1])) {
      return false;
    }
    if (
      i > 0 &&
      EXPONENT_SUFFIXES.includes(char) &&
      (OPERATORS + EXPONENT_SUFFIXES).includes(cleaned[i - 1])
    ) {
      // "2+²", "2^²", "2²²": an exponent needs a completed operand.
      return false;
    }
  }
  return depth === 0;
}

/** Backwards-compatible entry point: just the expression, or null. */
export function normalize(text: string): string | null {
  return normalizeWithWarnings(text).expression;
}
