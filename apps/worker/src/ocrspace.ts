/**
 * OCR.space as a server-side recognition engine (Phase 2).
 *
 * Design notes (mirroring gemini.ts):
 * - The API key is read from the request-time env binding ONLY. It travels
 *   in the `apikey` request header to OCR.space and is never logged, echoed
 *   or written anywhere; error reasons carry machine codes and numeric
 *   statuses only, never upstream bodies (they could echo request data).
 * - `fetchImpl` is injectable so unit tests exercise the flow without any
 *   network access.
 * - Input failures (malformed request, oversized image) stay ApiErrors so
 *   the router answers 400/413 like every other route; OCR.space failures
 *   (timeout, HTTP error, malformed response) degrade softly to
 *   `{ available: false, reason }` with HTTP 200 so the recognition
 *   pipeline continues with the other engines.
 *
 * This file: request parsing + the upstream call (engine 2, retried once
 * with engine 1 when engine 2 reads nothing). The route wiring and the
 * soft-fail envelope follow.
 */

import { normalize } from '@calculator-suite/math-core';
import type { FetchLike, WorkerEnv } from './env';
import { ApiError, readJsonBody } from './http';
import { ALLOWED_IMAGE_MIMES, decodedBase64Length, type AllowedImageMime } from './recognize';

export const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';

/**
 * Request-side cap on the DECODED image ("max 1 MB after resize" — the
 * client resizes; the server enforces). Matches OCR.space's own file limit,
 * so a larger image would be rejected upstream anyway.
 */
export const OCR_SPACE_MAX_IMAGE_BYTES = 1024 * 1024;

/** One accepted image: standard base64 plus a mime the API understands. */
export interface OcrSpaceImage {
  base64: string;
  mime: AllowedImageMime;
}

const MIME_LABEL = ALLOWED_IMAGE_MIMES.join(', ');

function isAllowedMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(value);
}

/**
 * Accept either bare base64 or a full data URI ("data:image/png;base64,…",
 * what the browser's canvas.toDataURL produces). The mime inside a data URI
 * wins; an explicit `mime` field is the fallback; default is PNG.
 */
function parseImageField(
  image: string,
  explicitMime: unknown,
  label: string
): OcrSpaceImage {
  let base64 = image;
  let mime: AllowedImageMime | undefined;

  const dataUri = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/s.exec(image);
  if (dataUri) {
    if (!isAllowedMime(dataUri[1])) {
      throw new ApiError(400, 'INVALID_IMAGE', `${label} data URI must be one of: ${MIME_LABEL}.`);
    }
    mime = dataUri[1];
    base64 = dataUri[2];
  } else if (typeof explicitMime === 'string') {
    if (!isAllowedMime(explicitMime)) {
      throw new ApiError(400, 'INVALID_IMAGE', `${label} mime must be one of: ${MIME_LABEL}.`);
    }
    mime = explicitMime;
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ApiError(400, 'INVALID_IMAGE', `${label} must be standard base64.`);
  }
  const decoded = decodedBase64Length(base64);
  if (decoded === 0) {
    throw new ApiError(400, 'INVALID_IMAGE', `${label} decoded to zero bytes.`);
  }
  if (decoded > OCR_SPACE_MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', `${label} exceeds the 1 MB limit.`);
  }

  return { base64, mime: mime ?? 'image/png' };
}

/** JSON body: { image: <base64|data URI>, mime?: <allowed mime> }. */
function parseJsonImage(body: object): OcrSpaceImage {
  const record = body as Record<string, unknown>;
  if (typeof record.image !== 'string' || record.image.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'image is required.');
  }
  return parseImageField(record.image, record.mime, 'image');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Pure base64 encoder (no btoa/Buffer assumptions across runtimes), for the
 * multipart branch where the image arrives as raw bytes.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += BASE64_ALPHABET[b0 >> 2];
    if (b1 === undefined) {
      // One trailing byte: its low bits still form a real character.
      out += `${BASE64_ALPHABET[(b0 & 0x03) << 4]}==`;
      return out;
    }
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (b2 === undefined) {
      // Two trailing bytes: the second character carries real bits too.
      out += `${BASE64_ALPHABET[(b1 & 0x0f) << 2]}=`;
      return out;
    }
    out += BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** Multipart body: an `image` file part (or a base64 text part), optional `mime`. */
async function parseMultipartImage(request: Request): Promise<OcrSpaceImage> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_MULTIPART', 'Request body is not valid multipart/form-data.');
  }

  const part = form.get('image');
  if (typeof part === 'string') {
    return parseImageField(part, form.get('mime'), 'image');
  }
  if (!part || typeof part !== 'object' || typeof (part as Blob).arrayBuffer !== 'function') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'image file part is required.');
  }

  const file = part as Blob;
  if (file.size > OCR_SPACE_MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', 'image exceeds the 1 MB limit.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new ApiError(400, 'INVALID_IMAGE', 'image decoded to zero bytes.');
  }

  const fileType = file.type;
  let mime: AllowedImageMime | undefined;
  if (fileType) {
    if (!isAllowedMime(fileType)) {
      throw new ApiError(400, 'INVALID_IMAGE', `image mime must be one of: ${MIME_LABEL}.`);
    }
    mime = fileType;
  } else {
    const formMime = form.get('mime');
    if (typeof formMime === 'string' && formMime) {
      if (!isAllowedMime(formMime)) {
        throw new ApiError(400, 'INVALID_IMAGE', `image mime must be one of: ${MIME_LABEL}.`);
      }
      mime = formMime;
    }
  }

  return { base64: bytesToBase64(bytes), mime: mime ?? 'image/png' };
}

/**
 * Parse the request into the image the OCR.space call needs. Accepts
 * `application/json` (base64 or data URI) and `multipart/form-data` (file or
 * base64 part). Throws ApiError(400/413) for anything unusable — validation
 * failures are client bugs and stay plain HTTP errors.
 */
export async function parseOcrSpaceImage(request: Request): Promise<OcrSpaceImage> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType === 'application/json') {
    return parseJsonImage(await readJsonBody(request));
  }
  if (contentType === 'multipart/form-data') {
    return parseMultipartImage(request);
  }
  throw new ApiError(
    400,
    'VALIDATION_ERROR',
    'content-type must be application/json or multipart/form-data.'
  );
}

/**
 * The env slice the OCR.space flow needs. Kept narrow for the same reason as
 * GeminiEnv; OCR_SPACE_API_KEY is a Cloudflare secret (never logged).
 */
export type OcrSpaceEnv = Pick<WorkerEnv, 'OCR_SPACE_API_KEY'>;

export const OCR_SPACE_TIMEOUT_MS = 10_000;

export type OcrSpaceErrorCode = 'timeout' | 'upstream_error' | 'malformed_response';

/**
 * One OCR.space failure. `detail` carries only technical-safe facts (the
 * numeric upstream HTTP status or a fixed phrase) — never an upstream body
 * and never the API key — so reasons are safe to surface to the browser.
 */
export class OcrSpaceError extends Error {
  readonly code: OcrSpaceErrorCode;
  readonly upstreamStatus?: number;

  constructor(code: OcrSpaceErrorCode, detail: string, upstreamStatus?: number) {
    super(detail);
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

interface OcrSpaceParsedResult {
  ParsedText?: unknown;
}

interface OcrSpaceResponseBody {
  ParsedResults?: OcrSpaceParsedResult[];
  IsErroredOnProcessing?: unknown;
  OCRExitCode?: unknown;
}

/** Pull the recognized text out of an OCR.space response; '' when none. */
export function extractOcrSpaceText(body: unknown): string {
  const record = (typeof body === 'object' && body !== null ? body : {}) as OcrSpaceResponseBody;
  const results = Array.isArray(record.ParsedResults) ? record.ParsedResults : [];
  return results
    .map((result) => (typeof result.ParsedText === 'string' ? result.ParsedText : ''))
    .join(' ')
    .trim();
}

/**
 * One OCR.space call: `POST /parse/image` with the key in the `apikey`
 * header and the engine parameters required by the scanner (engine, scale,
 * English, orientation detection, no overlay). The image travels as a
 * `base64Image` data URI form field. Returns the recognized text ('' when
 * nothing was read).
 */
export async function callOcrSpace(
  apiKey: string,
  image: OcrSpaceImage,
  engine: 1 | 2,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? OCR_SPACE_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.set('base64Image', `data:${image.mime};base64,${image.base64}`);
    form.set('OCREngine', String(engine));
    form.set('scale', 'true');
    form.set('language', 'eng');
    form.set('detectOrientation', 'true');
    form.set('isOverlayRequired', 'false');

    const response = await (options.fetchImpl ?? fetch)(OCR_SPACE_API_URL, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Status numbers only: 401/403 = bad key, 429 = quota. Bodies are
      // never relayed.
      throw new OcrSpaceError('upstream_error', `OCR.space request failed (${response.status}).`, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new OcrSpaceError('malformed_response', 'OCR.space returned malformed JSON.');
    }
    if ((body as OcrSpaceResponseBody)?.IsErroredOnProcessing === true) {
      // HTTP 200 but the engine reported an error of its own.
      throw new OcrSpaceError('upstream_error', 'OCR.space reported a processing error.');
    }
    return extractOcrSpaceText(body);
  } catch (error) {
    if (error instanceof OcrSpaceError) throw error;
    // AbortController timeout or a transport-level network failure.
    throw new OcrSpaceError('timeout', 'OCR.space request timed out.');
  } finally {
    clearTimeout(timer);
  }
}

/** What the route answers. Failure is ALWAYS soft: HTTP 200, pipeline continues. */
export type OcrSpaceOutcome =
  | { available: true; expression: string; rawText: string; engine: 1 | 2 }
  | { available: false; reason: string };

/**
 * OCR.space text is often multi-line (receipts, screenshots): normalize each
 * line separately and keep the longest surviving expression (ties keep the
 * first line's order), so junk lines cannot concatenate across a newline
 * into a longer wrong number.
 */
export function pickOcrSpaceExpression(rawText: string): string {
  let best = '';
  for (const line of rawText.split(/\r?\n/)) {
    const expression = normalize(line);
    if (expression !== null && expression.length > best.length) best = expression;
  }
  return best;
}

/**
 * Engine 2 first (the better model); when it reads NOTHING, retry once with
 * engine 1. An empty final read is still `available: true` with an empty
 * expression — the engine worked, there was just nothing to read.
 */
export async function recognizeWithOcrSpace(
  apiKey: string,
  image: OcrSpaceImage,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<OcrSpaceOutcome> {
  let engine: 1 | 2 = 2;
  let rawText = await callOcrSpace(apiKey, image, engine, options);
  if (!rawText) {
    engine = 1;
    rawText = await callOcrSpace(apiKey, image, engine, options);
  }
  return {
    available: true,
    expression: pickOcrSpaceExpression(rawText),
    rawText,
    engine,
  };
}

/** Soft-fail reason strings, one per OcrSpaceError code. */
function reasonFor(error: OcrSpaceError): string {
  switch (error.code) {
    case 'timeout':
      return 'timeout';
    case 'upstream_error':
      return 'ocrspace_unavailable';
    case 'malformed_response':
      return 'ocrspace_malformed_response';
  }
}

/**
 * The route handler: parse the image, run the engines, and turn EVERY
 * OCR.space failure into `{ available: false, reason }` with HTTP 200 so the
 * recognition pipeline continues with the other engines. Only input
 * validation errors (ApiError 400/413) propagate to the router, matching
 * every other route's behavior for malformed requests.
 */
export async function handleOcrSpace(
  request: Request,
  env: OcrSpaceEnv,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<OcrSpaceOutcome> {
  const image = await parseOcrSpaceImage(request);
  const apiKey = env.OCR_SPACE_API_KEY?.trim();
  if (!apiKey) {
    return { available: false, reason: 'not_configured' };
  }
  try {
    return await recognizeWithOcrSpace(apiKey, image, options);
  } catch (error) {
    if (error instanceof OcrSpaceError) {
      return { available: false, reason: reasonFor(error) };
    }
    // Unknown failure shape: stay soft, leak nothing (never the key).
    return { available: false, reason: 'ocrspace_error' };
  }
}
