/**
 * Cloudflare Worker entry point for the Gemini-assisted scanner API.
 *
 * Deployed alongside the static app (wrangler.jsonc: `main` + assets with
 * `run_worker_first` for /api/*). The static scanner UI talks ONLY to these
 * same-origin routes; the Gemini key stays in the Worker environment.
 *
 * Routes:
 *   GET  /api/scan/capabilities  -> { gemini: boolean }
 *   POST /api/scan/recognize     -> image + Tesseract hint -> corrected expression
 *   POST /api/scan/ocrspace      -> image -> OCR.space reading (soft-fail {available:false})
 *   POST /api/scan/consensus     -> image + candidates -> { expression, verified, sources, alternatives, stages }
 *   POST /api/solve/complex      -> gated question -> numeric answer
 *   GET  /api/health             -> liveness probe
 *   everything else              -> static assets (env.ASSETS)
 */

import type { WorkerEnv } from './env';
import { GeminiApiError, generateContent } from './gemini';
import {
  ApiError,
  RateLimiter,
  clientIp,
  errorResponse,
  isSameOriginRequest,
  jsonResponse,
  readJsonBody,
} from './http';
import {
  RECOGNIZE_SYSTEM_INSTRUCTION,
  SOLVE_SYSTEM_INSTRUCTION,
  VERIFY_SYSTEM_INSTRUCTION,
  buildRecognitionUserPayload,
  buildVerifyUserPayload,
} from './prompts';
import {
  buildRecognizeResult,
  mergedDigitsSuspect,
  parseRecognizeRequest,
  RECOGNIZE_TIMEOUT_MS,
} from './recognize';
import { assertClientEvaluable, buildSolveResult, parseSolveRequest } from './solve';
import { handleOcrSpace } from './ocrspace';
import { handleConsensusBody } from './consensus';

/** Per-client flood guard: 60 Gemini calls per 10 minutes per IP. Exported for test resets. */
export const limiter = new RateLimiter(60, 10 * 60 * 1000);
/** Scan flood guard (Phase 3, step 6): 10 scans per minute per IP. Exported for test resets. */
export const scanLimiter = new RateLimiter(10, 60 * 1000);
/** Hard body cap for POST bodies (4 MB covers a 3 MB base64 image + payload). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Requests with a Content-Length above this are rejected before reading. */
const MAX_BODY_BYTES_STRING = `${MAX_BODY_BYTES / (1024 * 1024)} MB`;

const IMAGE_MIME_PATTERN = /^(?:data:)?image\/(?:png|jpeg|webp)(?:;base64,|$)/;

function guard(request: Request, url: URL): void {
  if (!isSameOriginRequest(request, url)) {
    throw new ApiError(403, 'FOREIGN_ORIGIN', 'API routes accept same-origin requests only.');
  }
  if (!limiter.allow(clientIp(request))) {
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests; try again later.');
  }
}

/**
 * Phase-3 protections for the scan routes, on top of guard():
 *  - 10 scans/min per IP,
 *  - 4 MB body cap (header pre-check + the body limit at read time),
 *  - image content-type allowlist (png/jpeg/webp only) via the declared
 *    data-URI prefix or the `mime` field — full base64 validation stays in
 *    the per-route parsers.
 */
function guardScan(request: Request, url: URL): void {
  guard(request, url);
  if (!scanLimiter.allow(clientIp(request))) {
    throw new ApiError(429, 'SCAN_RATE_LIMIT_EXCEEDED', 'Too many scans; try again in a minute.');
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', `Request body exceeds ${MAX_BODY_BYTES_STRING}.`);
  }
}

/**
 * Content-type allowlist for scan JSON bodies: the declared image mime (the
 * data-URI prefix or the `mime` field) must be PNG/JPEG/WebP. The per-route
 * parsers enforce the same allowlist with detailed 400s; this early check
 * keeps non-image payloads out before any field-level validation.
 */
function assertScanImageMime(body: object): void {
  const record = body as Record<string, unknown>;
  const image = typeof record.image === 'string' ? record.image : '';
  const mime = typeof record.mime === 'string' ? record.mime : '';
  const declared = image.startsWith('data:') ? image : mime;
  // Bare base64 without any declared mime is fine: the route parser
  // defaults it to PNG. A DECLARED mime must be on the allowlist.
  if (declared && !IMAGE_MIME_PATTERN.test(declared)) {
    throw new ApiError(400, 'INVALID_IMAGE', 'image must be PNG, JPEG, or WebP.');
  }
}

/** JSON body for scan routes (the 4 MB cap is pre-checked in guardScan). */
async function readScanBody(request: Request, _url: URL): Promise<object> {
  return readJsonBody(request);
}

interface RecognizeImages {
  image: string;
  mime: string;
  enhanced?: string | null;
}

/** Model parts: original photo first (truth), then the enhanced crop, then text. */
function recognizeParts(images: RecognizeImages, hint: string | null): object[] {
  const parts: object[] = [{ inline_data: { mime_type: images.mime, data: images.image } }];
  if (images.enhanced) {
    parts.push({ inline_data: { mime_type: 'image/png', data: images.enhanced } });
  }
  parts.push({ text: buildRecognitionUserPayload(hint) });
  return parts;
}

/** Verify parts: the same images, plus the candidate to cross-examine. */
function verifyParts(images: RecognizeImages, candidate: string): object[] {
  const parts: object[] = [{ inline_data: { mime_type: images.mime, data: images.image } }];
  if (images.enhanced) {
    parts.push({ inline_data: { mime_type: 'image/png', data: images.enhanced } });
  }
  parts.push({ text: buildVerifyUserPayload(candidate) });
  return parts;
}

async function handleRecognize(request: Request, env: WorkerEnv): Promise<Response> {
  const body = parseRecognizeRequest(await readJsonBody(request));
  // P3: handwriting recognition needs the longer 25 s budget on BOTH passes
  // (the verify pass is the one production cut off at the default 20 s).
  const modelText = await generateContent(
    env,
    {
      parts: recognizeParts(body, body.hint),
      systemInstruction: RECOGNIZE_SYSTEM_INSTRUCTION,
    },
    { timeoutMs: RECOGNIZE_TIMEOUT_MS }
  );
  const first = buildRecognizeResult(modelText);
  // UNREADABLE needs no gate — there is nothing to verify.
  if (first.unreadable) return jsonResponse(200, first);

  // Trust gate — pass 2: another, independent read that cross-examines the
  // candidate glyph-by-glyph against the ink. It corrects residual errors
  // (merged digit groups, dropped operators) and is the reason an expression
  // only ships to the browser when two readings agree or one fixed the other.
  try {
    const verifyText = await generateContent(
      env,
      {
        parts: verifyParts(body, first.expression),
        systemInstruction: VERIFY_SYSTEM_INSTRUCTION,
      },
      { timeoutMs: RECOGNIZE_TIMEOUT_MS }
    );
    if (verifyText.trim().toUpperCase().includes('UNREADABLE')) {
      // Pass 2 could not confirm math in the image: do NOT ship the candidate
      // as if it were verified. Keep it visible but flag it unverified.
      return jsonResponse(200, { ...first, verified: false });
    }
    const verified = buildRecognizeResult(verifyText);
    if (verified.unreadable) {
      // Same principle: keep the candidate, mark it unverified.
      return jsonResponse(200, { ...first, verified: false });
    }
    if (verified.expression === first.expression) {
      return jsonResponse(200, { ...verified, verified: true });
    }
    // Pass 2 corrected pass 1 (or vice versa): the corrected reading is
    // itself an independent ink-backed read, so it ships verified.
    return jsonResponse(200, { ...verified, verified: true });
  } catch {
    // Pass 2 is an accuracy gate, not a hard dependency: when it fails
    // (rate limit, timeout) fall back to pass 1 but run the merged-digits
    // gate — an operator-bearing payload with an operator-less result is the
    // classic silent corruption, and nothing outranks nothing.
    if (mergedDigitsSuspect(body.hint, first.expression)) {
      return jsonResponse(200, { expression: '', source: 'gemini', unreadable: true });
    }
    return jsonResponse(200, { ...first, verified: false });
  }
}

async function handleSolve(request: Request, env: WorkerEnv): Promise<Response> {
  const body = parseSolveRequest(await readJsonBody(request));
  assertClientEvaluable(body.question);
  const modelText = await generateContent(env, {
    parts: [{ text: body.question }],
    systemInstruction: SOLVE_SYSTEM_INSTRUCTION,
  });
  return jsonResponse(200, buildSolveResult(modelText));
}

/** Map internal Gemini failures onto client-actionable HTTP statuses. */
function mapGeminiError(error: GeminiApiError): ApiError {
  switch (error.code) {
    case 'gemini_not_configured':
      return new ApiError(503, 'gemini_not_configured', 'Gemini is not configured.');
    case 'rate_limited':
      return new ApiError(429, 'rate_limited', 'Gemini is rate limited; try again shortly.');
    case 'timeout':
      return new ApiError(504, 'gemini_timeout', 'Gemini did not answer in time.');
    default:
      // GeminiApiError.detail carries only technical-safe facts (e.g. the
      // numeric upstream HTTP status) so a 502 in the browser immediately
      // betrays its cause: 401/403 = bad key, 404 = model unavailable, 500/503
      // = Google-side failure.
      return new ApiError(502, 'gemini_error', `Gemini request failed. ${error.detail}`);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response('Not found', { status: 404 });
    }

    try {
      guard(request, url);

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse(200, { ok: true });
      }
      if (url.pathname === '/api/scan/capabilities' && request.method === 'GET') {
        return jsonResponse(200, { gemini: Boolean(env.GEMINI_API_KEY?.trim()) });
      }
      if (url.pathname === '/api/scan/recognize' && request.method === 'POST') {
        guardScan(request, url);
        if (!env.GEMINI_API_KEY?.trim()) {
          throw new ApiError(503, 'gemini_not_configured', 'Gemini is not configured.');
        }
        return await handleRecognize(request, env);
      }
      if (url.pathname === '/api/scan/consensus' && request.method === 'POST') {
        // Phase-3 pipeline: SHA-256 image cache -> decide() -> (arbiter).
        // Only input validation throws; everything else degrades softly
        // inside the result (verified:false + stages).
        guardScan(request, url);
        const body = await readScanBody(request, url);
        assertScanImageMime(body);
        return jsonResponse(200, await handleConsensusBody(body, env));
      }
      if (url.pathname === '/api/scan/ocrspace' && request.method === 'POST') {
        // OCR.space is a soft engine: without a key, or on any failure, it
        // answers { available: false, reason } with 200 so the pipeline
        // continues (only invalid input propagates as 400/413). It accepts
        // JSON and multipart bodies, so it parses the body itself.
        guardScan(request, url);
        return jsonResponse(200, await handleOcrSpace(request, env));
      }
      if (url.pathname === '/api/solve/complex' && request.method === 'POST') {
        if (!env.GEMINI_API_KEY?.trim()) {
          throw new ApiError(503, 'gemini_not_configured', 'Gemini is not configured.');
        }
        return await handleSolve(request, env);
      }

      throw new ApiError(404, 'NOT_FOUND', `No API route: ${request.method} ${url.pathname}`);
    } catch (error) {
      if (error instanceof GeminiApiError) {
        return errorResponse(mapGeminiError(error));
      }
      if (error instanceof ApiError) {
        return errorResponse(error);
      }
      console.error('Unhandled worker error:', error);
      return jsonResponse(500, { error: 'INTERNAL', message: 'Unexpected server error.' });
    }
  },
};
