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
import { AI_PROVIDER, captureAiGeneration, readPostHogConfig } from './posthog';
import type { AiTrace, CaptureDelivery } from './posthog';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default model: verified live against the REST API (see apps/vision-backend). */
export const DEFAULT_MODEL_ID = 'gemini-3.8-flash';

/** Thinking-capable models need headroom beyond the visible answer. */
export const MAX_OUTPUT_TOKENS = 8192;

/** Tried ONLY when the default model id has rotted away (404). */
export const FALLBACK_MODEL_ID = 'gemini-3.5-flash-lite';

export type GeminiErrorCode =
  | 'gemini_not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'gemini_error'
  | 'empty_response';

export class GeminiApiError extends Error {
  readonly code: GeminiErrorCode;
  readonly status: number;
  /** Technical-safe diagnostic: the upstream request's failure description. */
  readonly detail: string;
  /** Numeric Gemini upstream HTTP status, when one was received. Diagnostic only. */
  readonly upstreamStatus?: number;

  constructor(code: GeminiErrorCode, status: number, detail: string, upstreamStatus?: number) {
    super(detail);
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.upstreamStatus = upstreamStatus;
  }
}

/** Env slice the model call and its (optional) telemetry need. */
export type GeminiEnv = Pick<
  WorkerEnv,
  'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'POSTHOG_PROJECT_TOKEN' | 'POSTHOG_HOST'
>;

/** Trace identity for one feature invocation, plus its background delivery. */
export interface GeminiTelemetry {
  trace: AiTrace;
  /** Hand the capture promise to the runtime lifecycle (ctx.waitUntil). */
  deliver?: CaptureDelivery;
}

export function environmentModel(env: Pick<WorkerEnv, 'GEMINI_MODEL'>): string {
  const configured = env.GEMINI_MODEL?.trim();
  return configured ? configured : DEFAULT_MODEL_ID;
}

/** Monotonic clock: latency must not be affected by wall-clock jumps. */
function monotonicNow(): number {
  return performance.now();
}

interface GeminiUsageMetadata {
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
}

export interface GeminiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Observed token counts from the response; never estimated or invented. */
export function observedUsage(body: object): GeminiUsage {
  const usage = (body as { usageMetadata?: GeminiUsageMetadata }).usageMetadata;
  const observed: GeminiUsage = {};
  if (typeof usage?.promptTokenCount === 'number' && Number.isFinite(usage.promptTokenCount)) {
    observed.inputTokens = usage.promptTokenCount;
  }
  if (
    typeof usage?.candidatesTokenCount === 'number' &&
    Number.isFinite(usage.candidatesTokenCount)
  ) {
    observed.outputTokens = usage.candidatesTokenCount;
  }
  return observed;
}

interface GeminiOutcome {
  httpStatus?: number;
  isError: boolean;
  usage: GeminiUsage;
}

/**
 * Emit exactly one metadata-only `$ai_generation` for this model call.
 *
 * The trace id comes from the caller (one per feature invocation); the span id
 * is unique to this generation. Delivery happens through the Worker's
 * background lifecycle when provided, so the HTTP response is not delayed.
 * Failures here can never change the model result or error.
 */
async function emitGeneration(
  env: GeminiEnv,
  model: string,
  telemetry: GeminiTelemetry | undefined,
  startedAt: number,
  outcome: GeminiOutcome
): Promise<void> {
  if (!telemetry) return;
  const config = readPostHogConfig(env);
  if (!config) return;

  try {
    const work = captureAiGeneration(config, {
      traceId: telemetry.trace.traceId,
      spanId: crypto.randomUUID(),
      sessionId: telemetry.trace.sessionId,
      distinctId: telemetry.trace.distinctId,
      model,
      provider: AI_PROVIDER,
      latencySeconds: (monotonicNow() - startedAt) / 1000,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      isError: outcome.isError || undefined,
      httpStatus: outcome.httpStatus,
    });
    if (telemetry.deliver) {
      telemetry.deliver(work);
    } else {
      await work;
    }
  } catch {
    // Observability is strictly best-effort.
  }
}

interface GeminiTextPart {
  text?: string;
  /** Thinking models mark their internal reasoning parts with this flag. */
  thought?: boolean;
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
  // Thinking models return their internal reasoning as thought parts; those
  // are NOT the answer — joining them would let raw reasoning text leak into
  // a recognition/solve result.
  return parts
    .map((part) => (typeof part.text === 'string' && part.thought !== true ? part.text : ''))
    .join('')
    .trim();
}

/** Call the model with one request payload and return the visible text. */
async function callGeminiOnce(
  env: GeminiEnv,
  apiKey: string,
  model: string,
  payload: GeminiRequestPayload,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    telemetry?: GeminiTelemetry;
    maxOutputTokens?: number;
  }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  // Latency covers the whole call: request, response and body parsing.
  const startedAt = monotonicNow();
  const outcome: GeminiOutcome = { isError: false, usage: {} };

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
          generationConfig: {
            temperature: 0,
            maxOutputTokens: options.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
          },
        }),
        signal: controller.signal,
      }
    );

    if (response.status === 429) {
      throw new GeminiApiError('rate_limited', 429, 'Gemini rate limit reached.', 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiApiError('gemini_error', 502, 'Gemini rejected the API key.', response.status);
    }
    if (response.status === 404) {
      throw new GeminiApiError(
        'gemini_error',
        502,
        `Gemini model ${model} is not available.`,
        404
      );
    }
    if (!response.ok) {
      throw new GeminiApiError(
        'gemini_error',
        502,
        `Gemini request failed (${response.status}).`,
        response.status
      );
    }

    const body = (await response.json()) as object;
    const text = extractGeminiText(body);
    if (!text) {
      // Thinking models can spend the whole budget reasoning and return a
      // visible-empty body.
      throw new GeminiApiError('empty_response', 502, 'Gemini returned no visible text.');
    }
    outcome.httpStatus = response.status;
    outcome.usage = observedUsage(body);
    return text;
  } catch (error) {
    const normalized =
      error instanceof GeminiApiError
        ? error
        : // AbortController timeout or transport-level network failure.
          new GeminiApiError('timeout', 504, 'Gemini request timed out.');
    outcome.isError = true;
    outcome.httpStatus = normalized.upstreamStatus;
    throw normalized;
  } finally {
    clearTimeout(timer);
    await emitGeneration(env, model, options.telemetry, startedAt, outcome);
  }
}

export async function generateContent(
  env: GeminiEnv,
  payload: GeminiRequestPayload,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    telemetry?: GeminiTelemetry;
    /** Per-call model pin; overrides GEMINI_MODEL for this call only. */
    model?: string;
    /** Per-call output cap (default MAX_OUTPUT_TOKENS). */
    maxOutputTokens?: number;
  } = {}
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiApiError('gemini_not_configured', 503, 'GEMINI_API_KEY is not set.');
  }

  // A per-call model pin counts as an operator pin: 404/503 must NOT
  // silently swap models for a caller that asked for a specific one.
  const userModel = options.model?.trim() || env.GEMINI_MODEL?.trim();
  let model = userModel || DEFAULT_MODEL_ID;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callGeminiOnce(env, apiKey, model, payload, options);
    } catch (error) {
      const geminiError =
        error instanceof GeminiApiError
          ? error
          : new GeminiApiError('timeout', 504, 'Gemini request timed out.');

      // One recovery attempt, in two controlled shapes:
      //  - the default model is unavailable (404) or its capacity pool is
      //    exhausted (503) → try the fallback model, but never second-guess
      //    a model the operator pinned;
      //  - a transient Google-side failure (other 5xx) or a visible-empty
      //    thinking response → the same request once more.
      if (
        attempt === 0 &&
        !userModel &&
        (geminiError.upstreamStatus === 404 || geminiError.upstreamStatus === 503)
      ) {
        model = FALLBACK_MODEL_ID;
        continue;
      }
      if (
        attempt === 0 &&
        ((geminiError.upstreamStatus !== undefined && geminiError.upstreamStatus >= 500) ||
          geminiError.code === 'empty_response')
      ) {
        continue;
      }
      throw geminiError;
    }
  }
}
