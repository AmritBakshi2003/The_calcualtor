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

interface GenerationOutcome {
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
  outcome: GenerationOutcome
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
  env: GeminiEnv,
  payload: GeminiRequestPayload,
  options: { fetchImpl?: FetchLike; timeoutMs?: number; telemetry?: GeminiTelemetry } = {}
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiApiError('gemini_not_configured', 503, 'GEMINI_API_KEY is not set.');
  }

  const model = environmentModel(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  // Latency covers the whole call: request, response and body parsing.
  const startedAt = monotonicNow();
  const outcome: GenerationOutcome = { isError: false, usage: {} };

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
    outcome.httpStatus = normalized.status;
    throw normalized;
  } finally {
    clearTimeout(timer);
    await emitGeneration(env, model, options.telemetry, startedAt, outcome);
  }
}
