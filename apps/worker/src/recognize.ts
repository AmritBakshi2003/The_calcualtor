/**
 * Parsing, validation and output hygiene for `POST /api/scan/recognize`.
 *
 * Mirrors the Python pipeline: incoming image bytes are size/mime limited,
 * the model answer is unwrapped (Markdown fences, UNREADABLE) and then must
 * survive the structural regex — only `0-9 + - * / . ( )` survive — before
 * it is ever returned to the browser.
 */

import { ApiError } from './http';

export const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

/** Hard cap on the DECODED image size per scan (Worker request limits aside). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_HINT_CHARS = 500;

/**
 * Per-call Gemini timeout for /api/scan/recognize ONLY (P3): handwriting
 * needs the model's full thinking budget, and the 20 s default cut the
 * verify pass off mid-answer in production. Everything else keeps the
 * client-facing 20 s default.
 */
export const RECOGNIZE_TIMEOUT_MS = 25_000;

export interface RecognizeRequestBody {
  /** Raw base64 (standard alphabet, padding allowed) of the image. */
  image: string;
  mime: AllowedImageMime;
  /** Tesseract's best reading, or null when the local engine found nothing. */
  hint: string | null;
  /**
   * Optional second image: the same line preprocessed in the browser
   * (grayscale, contrast-normalized, cropped). Helps the model through glare,
   * shadows and colour noise. Optional: older clients omit it.
   */
  enhanced?: string | null;
}

export interface RecognizeResult {
  /** Structural-matched expression; '' when the model said UNREADABLE. */
  expression: string;
  source: 'gemini';
  unreadable: boolean;
  /** True only when a second model pass confirmed the expression against the ink. */
  verified?: boolean;
}

/**
 * Same validation as the primary image, minus the mandatory-field checks.
 * Shared so the enhanced image can never slip through weaker rules.
 */
function parseOptionalBase64Image(value: unknown, label: string): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a base64 string or null.`);
  }
  const decoded = decodedBase64Length(value);
  if (decoded === 0) {
    throw new ApiError(400, 'INVALID_IMAGE', `${label} decoded to zero bytes.`);
  }
  if (decoded > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', `${label} exceeds the 5 MB limit.`);
  }
  return value;
}

/** Decoded byte length of a base64 string (no allocation, charset checked). */
export function decodedBase64Length(value: string): number {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ApiError(400, 'INVALID_IMAGE', 'image must be standard base64.');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, (value.length * 3) / 4 - padding);
}

export function parseRecognizeRequest(body: unknown): RecognizeRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  if (typeof record.image !== 'string' || record.image.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'image is required.');
  }
  const decoded = decodedBase64Length(record.image);
  if (decoded === 0) {
    throw new ApiError(400, 'INVALID_IMAGE', 'image decoded to zero bytes.');
  }
  if (decoded > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', 'image exceeds the 5 MB limit.');
  }

  if (
    typeof record.mime !== 'string' ||
    !ALLOWED_IMAGE_MIMES.includes(record.mime as AllowedImageMime)
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `mime must be one of: ${ALLOWED_IMAGE_MIMES.join(', ')}.`
    );
  }

  let hint: string | null = null;
  if (record.hint !== null && record.hint !== undefined) {
    if (typeof record.hint !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'hint must be a string or null.');
    }
    hint = record.hint.slice(0, MAX_HINT_CHARS);
  }

  return {
    image: record.image,
    mime: record.mime as AllowedImageMime,
    hint,
    enhanced: parseOptionalBase64Image(record.enhanced, 'enhanced'),
  };
}

/**
 * Strip the conversation hygiene the model may leak: Markdown fences,
 * stray whitespace; `UNREADABLE` collapses to '' (nothing was recognized).
 */
export function unwrapRecognitionText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines.length > 0 && lines[0].startsWith('```')) lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    cleaned = lines.join('\n').trim();
  }
  if (cleaned.toUpperCase().includes('UNREADABLE')) return '';
  return cleaned;
}

/**
 * Step-5 structural regex, shared with the Python pipeline: only
 * `0-9 + - * / . ( )` survive. Returns the compact expression or ''.
 */
export function structuralMatch(text: string): string {
  const compact = text.replace(/[^0-9+\-*/.()]/g, '');
  // A bare number or garbage-in-the-operators-only string is not an
  // expression the scanner is useful for: require at least one digit and,
  // when any operator survived, at least two operands' worth of digits.
  if (!/[0-9]/.test(compact)) return '';
  return compact;
}

/**
 * Hard trust gate for the FINAL outcome, used when the verification pass is
 * unavailable. Handwritten numbers merged into one long digit run ("99+99÷9"
 * read as "954095") are the misread Tesseract and a rushed model both make;
 * when the payload clearly contained operators but the final expression lost
 * every one of them, the outcome is not trustworthy enough to compute with —
 * better nothing than silently wrong.
 */
export function mergedDigitsSuspect(hint: string | null, expression: string): boolean {
  if (!hint) return false;
  const hintHasOperator = /[+\-*/×÷]/.test(hint.replace(/\s/g, ''));
  return hintHasOperator && expression.length >= 4 && !/[+\-*/]/.test(expression);
}

export function buildRecognizeResult(modelText: string): RecognizeResult {
  const unwrapped = unwrapRecognitionText(modelText);
  if (!unwrapped) {
    return { expression: '', source: 'gemini', unreadable: true };
  }
  const expression = structuralMatch(unwrapped);
  if (!expression) {
    throw new ApiError(502, 'NO_MATH_CONTENT', 'Gemini returned no structural math content.');
  }
  return { expression, source: 'gemini', unreadable: false };
}
