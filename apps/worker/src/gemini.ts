/**
 * Thin REST client for the Gemini `generateContent` API.
 *
 * Design notes:
 * - The API key is read from the request-time env binding ONLY — it is never
 *   logged, echoed, or written anywhere. It travels as the `x-goog-api-key`
 *   header, which the REST API accepts natively.
 * - `fetchImpl` is injectable so unit tests exercise classification logic
 *   without network access.
 * - Errors are normalized into one `GeminiApiError` with a machine code the
 *   router maps onto HTTP statuses; upstream bodies are never relayed to the
 *   browser (they could echo the request payload).
 */

import type { FetchLike, WorkerEnv } from './env';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default model: verified live against the REST API (see apps/vision-backend). */
export const DEFAULT_MODEL_ID = 'gemini-3.8-flash';

/** Thinking-capable models need headroom beyond the visible answer. */
export const MAX_OUTPUT_TOKENS = 1024;

export type GeminiErrorCode =
  | 'gemini_not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'gemini_error'
  | 'empty_response';

export class GeminiApiError extends Error {
  readonly code: GeminiErrorCode;
  readonly status: number;

  constructor(code: GeminiErrorCode, status: number, detail: string) {
    super(detail);
    this.code = code;
    this.status = status;
  }
}

export function environmentModel(env: Pick<WorkerEnv, 'GEMINI_MODEL'>): string {
  const configured = env.GEMINI_MODEL?.trim();
  return configured ? configured : DEFAULT_MODEL_ID;
}

interface GeminiTextPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiTextPart[] };
  finishReason?: string;
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
}

interface GeminiRequestPayload {
  parts: object[];
  systemInstruction: string;
}

/** Pull the joined text out of a Gemini response body. */
export function extractGeminiText(body: object): string {
  const candidates = (body as GeminiResponseBody).candidates ?? [];
  const parts = candidates[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

/** Call the model with one request payload and return the visible text. */
export async function generateContent(
  env: Pick<WorkerEnv, 'GEMINI_API_KEY' | 'GEMINI_MODEL'>,
  payload: GeminiRequestPayload,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiApiError('gemini_not_configured', 503, 'GEMINI_API_KEY is not set.');
  }

  const model = environmentModel(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: payload.parts }],
          systemInstruction: { parts: [{ text: payload.systemInstruction }] },
          generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: controller.signal,
      }
    );

    if (response.status === 429) {
      throw new GeminiApiError('rate_limited', 429, 'Gemini rate limit reached.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiApiError('gemini_error', 502, 'Gemini rejected the API key.');
    }
    if (response.status === 404) {
      throw new GeminiApiError('gemini_error', 502, `Gemini model ${model} is not available.`);
    }
    if (!response.ok) {
      throw new GeminiApiError('gemini_error', 502, `Gemini request failed (${response.status}).`);
    }

    const body = (await response.json()) as object;
    const text = extractGeminiText(body);
    if (!text) {
      // Models with thinking budgets can return a visible-empty body.
      throw new GeminiApiError('empty_response', 502, 'Gemini returned no visible text.');
    }
    return text;
  } catch (error) {
    if (error instanceof GeminiApiError) throw error;
    // AbortController timeout or transport-level network failure.
    throw new GeminiApiError('timeout', 504, 'Gemini request timed out.');
  } finally {
    clearTimeout(timer);
  }
}
