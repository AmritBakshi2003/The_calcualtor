/**
 * Parsing, gating and output hygiene for `POST /api/solve/complex`.
 *
 * The browser evaluates classic arithmetic locally and only forwards
 * questions it could not answer (see the complexity gate in the web app).
 * This module is the second line of defence so simple taps never cost
 * tokens even if a misbehaving client asks, and it validates the model's
 * answer before serving it.
 */

import { ApiError } from './http';

export const MAX_SOLVE_LENGTH = 500;

export interface SolveRequestBody {
  /** The question as unresolved text: expression or word problem. */
  question: string;
}

export interface SolveResult {
  /** Validated numeric answer, or null when the model said UNANSWERABLE. */
  answer: string | null;
  source: 'gemini';
}

export function parseSolveRequest(body: unknown): SolveRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;
  if (typeof record.question !== 'string' || record.question.trim().length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'question is required.');
  }
  const question = record.question.trim();
  if (question.length > MAX_SOLVE_LENGTH) {
    throw new ApiError(400, 'QUESTION_TOO_LONG', `question exceeds ${MAX_SOLVE_LENGTH} characters.`);
  }
  if (!/[0-9]/.test(question)) {
    throw new ApiError(400, 'NO_NUMERIC_CONTENT', 'question contains no digits to compute from.');
  }
  return { question };
}

/**
 * Server-side mirror of the client gate: pure numeric arithmetic that a
 * calculator evaluates instantly must NOT reach the model. Letters
 * (word problems, functions like sqrt/log) and long nesting are complex.
 */
const SIMPLE_ARITHMETIC = /^[0-9+\-*/^%().\s]+$/;

export function looksLikeSimpleArithmetic(question: string): boolean {
  const compact = question.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > 80) return false;
  if (!SIMPLE_ARITHMETIC.test(compact)) return false;
  // Needs both an operand and an operator to be arithmetic at all.
  return /\d/.test(compact) && /[+\-*/^%]/.test(compact.slice(1));
}

export function assertClientEvaluable(question: string): void {
  if (looksLikeSimpleArithmetic(question)) {
    throw new ApiError(400, 'CLIENT_EVALUABLE', 'Simple arithmetic must be evaluated locally.');
  }
}

/**
 * Answer contract: the model outputs one plain number or the word
 * UNANSWERABLE. A whole-body number is ideal; a short reply that merely
 * trails a number ("42", "$1,234", "answer: 5.5") still yields that
 * number. Anything verbose is rejected rather than guessed at.
 */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
const TRAILING_NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

export function unwrapAnswerText(text: string): { answer: string | null } | null {
  const cleaned = text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .trim();

  if (cleaned.toUpperCase().includes('UNANSWERABLE')) {
    return { answer: null };
  }

  const normalized = cleaned.replace(/[$,\s]/g, '').replace(/^=/, '');
  if (PLAIN_NUMBER.test(normalized)) {
    return { answer: normalized };
  }

  // Short decorated replies: keep the trailing numeric token only when the
  // whole answer is short, so a chatty paragraph cannot smuggle a fake result.
  const trailing = normalized.match(/(-?\d+(\.\d+)?(e[+-]?\d+)?)$/i);
  if (trailing && normalized.length <= 40) {
    // The token only counts when everything before it is non-numeric noise.
    const prefix = normalized.slice(0, normalized.length - trailing[1].length);
    if (!/\d/.test(prefix)) {
      const candidate = trailing[1].match(TRAILING_NUMBER);
      if (candidate) return { answer: trailing[1] };
    }
  }
  return null;
}

export function buildSolveResult(modelText: string): SolveResult {
  const unwrapped = unwrapAnswerText(modelText);
  if (unwrapped === null) {
    throw new ApiError(502, 'NO_ANSWER', 'Gemini did not return a usable numeric answer.');
  }
  return { answer: unwrapped.answer, source: 'gemini' };
}
