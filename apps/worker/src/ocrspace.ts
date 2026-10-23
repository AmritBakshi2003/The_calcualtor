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
 * Step 2 (this file): request parsing only. The upstream call, engine
 * fallback and route follow in the next steps.
 */

import type { WorkerEnv } from './env';
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
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += b1 === undefined ? '=' : b2 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
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
