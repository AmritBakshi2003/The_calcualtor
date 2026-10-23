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
 * x/X/* -> "×", look-alikes of ÷ -> "÷"; anything outside the string is
 * dropped before validation.
 */
export const SCAN_WHITELIST = '0123456789+-×÷*/().=x';

/**
 * Look-alike mapping applied BEFORE the whitelist filter, so a misread glyph
 * lands on the arithmetic character it stood for instead of being dropped
 * (dropping silently changes the value: "2−3" -> "23").
 *
 *  - x / X / * are multiplication in a calculator expression; "*" is mapped
 *    to the display form "×" so candidates read the way the user wrote them
 *    (the evaluator still accepts both via cleanForEvaluation).
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
  '∕': '÷',
  '⁄': '÷',
  ':': '÷',
  '−': '-',
  '–': '-',
  '—': '-',
};

/** Operators that cannot appear twice in a row. */
const OPERATORS = '+-×÷*/';

/**
 * Turn raw OCR text into a clean candidate expression, or null when nothing
 * expression-like survives:
 *
 *  1. map look-alike characters onto the scan alphabet,
 *  2. drop every character outside SCAN_WHITELIST,
 *  3. remove all whitespace,
 *  4. strip trailing "=" (a printed result marker on calculator screens,
 *     presentation, not part of the expression),
 *  5. validate: balanced brackets, no two operators in a row, and the text
 *     must start and end with a number or a bracket.
 *
 * Pure; returns null for empty, junk, or structurally invalid input.
 * Note the spec-literal validity rules mean a leading unary minus ("-5+3")
 * or a trailing operator ("2+3+") is rejected.
 */
export function normalize(text: string): string | null {
  if (!text) return null;

  let out = '';
  for (const char of text) {
    out += CHAR_MAP[char] ?? char;
  }

  // Drop everything the scanner alphabet does not name.
  let cleaned = '';
  for (const char of out) {
    if (SCAN_WHITELIST.includes(char)) cleaned += char;
  }

  // Whitespace is presentation.
  cleaned = cleaned.replace(/\s+/g, '');

  // Calculator screens print an "=" after the expression ("2+3="); it marks
  // the result, it is not an operator. Strip trailing markers only.
  cleaned = cleaned.replace(/=+$/, '');

  if (cleaned.length === 0) return null;

  // Must start and end with a number or a bracket.
  if (!/[0-9(]/.test(cleaned[0]) || !/[0-9)]/.test(cleaned[cleaned.length - 1])) return null;

  // Brackets must balance (and never close before opening).
  let depth = 0;
  for (const char of cleaned) {
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth < 0) return null;
    }
  }
  if (depth !== 0) return null;

  // No two operators in a row ("2+-3", "3××4").
  for (let i = 1; i < cleaned.length; i++) {
    if (OPERATORS.includes(cleaned[i]) && OPERATORS.includes(cleaned[i - 1])) return null;
  }

  return cleaned;
}
