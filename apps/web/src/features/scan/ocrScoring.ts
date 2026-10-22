/**
 * Scoring for OCR output.
 *
 * Tesseract happily returns text for anything, so "did the result parse?" is a
 * poor selector: a stray date or price parses as a number just as well as the
 * expression the user wanted. These heuristics rank candidates by how much they
 * look like the arithmetic the Scan tab is meant to read:
 *
 *  - more digits is better, but only up to a point (a 12-digit receipt total
 *    should not outrank a short expression);
 *  - an operator BETWEEN two operands is a strong signal;
 *  - a "=" is a mild signal (calculator screens show "12 + 34 =");
 *  - a date ("12/03/2025") or a clock ("9:41") is almost never the answer;
 *  - a candidate the evaluator rejects is worth much less than one it accepts;
 *  - Tesseract's own confidence breaks ties.
 *
 * Pure and dependency-free apart from the evaluator, so it is unit tested.
 */

import { evaluateExpression } from '@calculator-suite/math-core';

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrSymbol {
  text: string;
  confidence: number;
}

/** One line of OCR output, with geometry and confidence when available. */
export interface OcrSegment {
  text: string;
  confidence: number;
  bbox?: BBox;
  symbols?: OcrSymbol[];
}

export interface OcrCandidate {
  /** Where the text came from, kept for debugging and tests. */
  source: 'block' | 'line' | 'block-open' | 'line-open' | 'crop' | 'fallback';
  /** Text after cleanForEvaluation. */
  expression: string;
  confidence: number;
  /** False when the pass's confidence is a reporting quirk (whitelist reads 0). */
  confidenceKnown?: boolean;
  score: number;
  segment?: OcrSegment;
}

/**
 * Confidence the scoring treats a whitelist pass as having. With a whitelist
 * active Tesseract reports 0 for every word even when the text is right, so a
 * 0 is replaced by this when ranking (but not displayed to the user).
 */
export const WHITELIST_CONFIDENCE_FALLBACK = 55;

const DATE_LIKE = /^\s*\d{1,4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,4}\s*$/;
const CLOCK_LIKE = /^\s*\d{1,2}\s*[:.]\s*\d{2}\s*(?:[ap]m)?\s*$/i;

/** Normalize the glyphs OCR commonly emits into the arithmetic we score. */
function normalizeForScoring(text: string): string {
  return text
    .replace(/[−–—]/g, '-')
    .replace(/[×✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/([\d)])\s*[xX]\s*(?=[\d(.])/g, '$1*');
}

function countDigits(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

/**
 * Scoring ignores spacing: "2 * 45" and "2*45" must count the same, otherwise
 * the operator-between-operands signal is lost as soon as OCR emits spaces.
 */
function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Drop words before testing date/clock shapes.
 *
 * The guards used to be anchored with ^...$, so ANY word on the line weakened
 * them: "Order 12/03/2025" on a receipt looked like a digit line, beat the
 * real expression, and even evaluated as a division. Numbers and operators
 * must stay: stripping them would erase "12/03/2025" into just spaces.
 */
function stripWords(text: string): string {
  return text.replace(/[A-Za-z]+/g, ' ');
}

/** Operators with an operand on both sides ("2+3", "(1+2)*3"), not "-5". */
function countOperators(text: string): number {
  let count = 0;
  for (let i = 1; i < text.length - 1; i++) {
    if (!'+-*/^'.includes(text[i])) continue;
    if (/[\d).]/.test(text[i - 1]) && /[\d(.]/.test(text[i + 1])) count++;
  }
  return count;
}

/**
 * How much a raw OCR line looks like a small arithmetic expression.
 * Used to choose between text lines before any cleaning happens.
 */
export function textShapeScore(raw: string): number {
  // normalizeForScoring first ("2x3" -> "2*3"), then strip words away.
  const text = compact(stripWords(normalizeForScoring(raw)));
  let score = Math.min(countDigits(text), 10) * 2;
  score += Math.min(countOperators(text), 3) * 14;
  if (text.includes('=')) score += 6;

  if (DATE_LIKE.test(text)) score -= 45;
  else if (CLOCK_LIKE.test(text)) score -= 45;

  return score;
}

/**
 * How good a cleaned candidate expression is, given the recognition confidence
 * of the pass that produced it.
 */
export function expressionScore(expression: string, confidence: number, raw?: string): number {
  if (!expression.trim()) return Number.NEGATIVE_INFINITY;

  const compacted = compact(expression);
  const digits = countDigits(compacted);
  const operators = countOperators(compacted);

  let score = Math.min(digits, 10) * 2;
  score += Math.min(operators, 3) * 14;
  score += Math.max(0, Math.min(100, confidence)) * 0.25;

  let parses = false;
  try {
    parses = evaluateExpression(expression).success;
  } catch {
    parses = false;
  }
  score += parses ? 20 : -40;

  const scoredAs = compact(stripWords(normalizeForScoring(raw ?? expression)));
  if (DATE_LIKE.test(scoredAs) || CLOCK_LIKE.test(scoredAs)) score -= 45;

  return score;
}

/** Rank lines best-first; ties keep document order. */
export function rankSegments(segments: OcrSegment[]): OcrSegment[] {
  return segments
    .map((segment, index) => ({ segment, index, score: textShapeScore(segment.text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.segment);
}

export function pickBestCandidate<T extends OcrCandidate>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.score)) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

/** Symbols that survive postprocessing and were read with low confidence. */
export function lowConfidenceSymbolCount(segment: OcrSegment | undefined, threshold = 60): number {
  if (!segment?.symbols?.length) return 0;
  return segment.symbols.filter(
    (symbol) => /[0-9+\-*/×÷().,=^%xX]/.test(symbol.text) && symbol.confidence < threshold
  ).length;
}
