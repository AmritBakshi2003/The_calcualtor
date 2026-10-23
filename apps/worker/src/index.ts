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
  buildRecognitionUserPayload,
} from './prompts';
import { buildRecognizeResult, parseRecognizeRequest } from './recognize';
import { assertClientEvaluable, buildSolveResult, parseSolveRequest } from './solve';

/** Per-client flood guard: 60 Gemini calls per 10 minutes per IP. */
const limiter = new RateLimiter(60, 10 * 60 * 1000);

function guard(request: Request, url: URL): void {
  if (!isSameOriginRequest(request, url)) {
    throw new ApiError(403, 'FOREIGN_ORIGIN', 'API routes accept same-origin requests only.');
  }
  if (!limiter.allow(clientIp(request))) {
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests; try again later.');
  }
}

async function handleRecognize(request: Request, env: WorkerEnv): Promise<Response> {
  const body = parseRecognizeRequest(await readJsonBody(request));
  const modelText = await generateContent(env, {
    parts: [
      { inline_data: { mime_type: body.mime, data: body.image } },
      { text: buildRecognitionUserPayload(body.hint) },
    ],
    systemInstruction: RECOGNIZE_SYSTEM_INSTRUCTION,
  });
  return jsonResponse(200, buildRecognizeResult(modelText));
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
      return new ApiError(502, 'gemini_error', 'Gemini request failed.');
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
        if (!env.GEMINI_API_KEY?.trim()) {
          throw new ApiError(503, 'gemini_not_configured', 'Gemini is not configured.');
        }
        return await handleRecognize(request, env);
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
