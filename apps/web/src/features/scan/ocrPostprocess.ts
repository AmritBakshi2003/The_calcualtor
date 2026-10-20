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
 * Check if a character is in a digit position (safe to substitute)
 * This is a heuristic: positions surrounded by operators or at boundaries
 */
function isDigitPosition(text: string, index: number): boolean {
  const char = text[index];
  const prev = text[index - 1] || '';
  const next = text[index + 1] || '';

  // Character is already a digit
  if (/[0-9]/.test(char)) return true;

  // Allow substitution if:
  // - At start or end of string
  // - Preceded by operator or space
  // - Followed by operator or space
  const operators = '+-*/×÷^().,= ';
  const isPrevOperator = prev === '' || operators.includes(prev);
  const isNextOperator = next === '' || operators.includes(next);

  return isPrevOperator || isNextOperator;
}

/**
 * Apply character substitutions only in safe digit positions
 */
function applySafeSubstitutions(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
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
