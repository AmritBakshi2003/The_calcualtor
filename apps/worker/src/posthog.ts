/**
 * Metadata-only PostHog capture for the scanner's Gemini call.
 *
 * This module is server-only (imported by the Worker, never by the browser
 * app) and deliberately tiny: no SDK, one `$ai_generation` event per model
 * call, POSTed with the built-in `fetch` to the configured ingestion host.
 *
 * Privacy contract — properties are an ALLOWLIST:
 * - identifiers: `$ai_trace_id`, `$ai_span_id`, `$ai_session_id` (null; the
 *   scanner has no session id) and a random `distinct_id` per invocation,
 * - model/provider: `$ai_model`, `$ai_provider` (fixed `google`),
 * - numbers only: `$ai_latency` (seconds), observed `$ai_input_tokens` /
 *   `$ai_output_tokens`, `$ai_http_status`, `$ai_is_error`.
 *
 * Prompts, OCR hints, model output, tool contents, request headers, raw errors
 * and stack traces never reach the event. The project token travels only in
 * the top-level `api_key` field.
 *
 * Everything here is best-effort: a missing token/host disables capture, an
 * unsupported host disables capture, and every transport/status failure is
 * swallowed after a bounded 2 s timeout with no retries.
 */

import type { FetchLike, WorkerEnv } from './env';

/** Ingestion hosts this integration will ever POST to (never app.posthog.com). */
export const POSTHOG_INGEST_HOSTS = ['https://us.i.posthog.com', 'https://eu.i.posthog.com'] as const;

/** Manual capture endpoint appended to the ingestion host. */
export const POSTHOG_CAPTURE_PATH = '/i/v0/e/';

/** Hard ceiling for one capture POST; no retries are attempted. */
export const POSTHOG_CAPTURE_TIMEOUT_MS = 2_000;

/** The only model provider this feature calls. */
export const AI_PROVIDER = 'google';

/** Fixed event name used by PostHog AI Observability. */
export const AI_GENERATION_EVENT = '$ai_generation';

export interface PostHogConfig {
  /** Exactly one of POSTHOG_INGEST_HOSTS. */
  host: string;
  /** Project capture token from project settings. */
  token: string;
  /** Fully formed capture URL, e.g. https://us.i.posthog.com/i/v0/e/ */
  captureUrl: string;
}

/** A trace belongs to one feature invocation; every generation gets a span. */
export interface AiTrace {
  traceId: string;
  distinctId: string;
  /** Opaque existing session id, or null when the feature has none. */
  sessionId: string | null;
}

export interface AiGenerationObservation {
  traceId: string;
  spanId: string;
  sessionId: string | null;
  distinctId: string;
  model: string;
  provider: string;
  /** Wall-clock duration of the model call, in seconds. */
  latencySeconds: number;
  inputTokens?: number;
  outputTokens?: number;
  isError?: boolean;
  httpStatus?: number;
}

/** Property bag PostHog receives for one generation. */
export type AiGenerationProperties = Record<string, string | number | boolean | null>;

/** Deliver a capture promise through the runtime's background lifecycle. */
export type CaptureDelivery = (work: Promise<void>) => void;

/** Trim surrounding whitespace and trailing slashes from a configured host. */
export function normalizePostHogHost(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return (POSTHOG_INGEST_HOSTS as readonly string[]).includes(trimmed) ? trimmed : null;
}

/**
 * Resolve capture configuration at request time.
 *
 * Returns null — capture becomes a no-op — when the token or host is absent
 * or when the host is not one of the two allowed ingestion origins. The
 * region is never guessed: the operator must set it.
 */
export function readPostHogConfig(
  env: Pick<WorkerEnv, 'POSTHOG_PROJECT_TOKEN' | 'POSTHOG_HOST'>
): PostHogConfig | null {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return null;
  const host = normalizePostHogHost(env.POSTHOG_HOST);
  if (!host) return null;
  return { host, token, captureUrl: `${host}${POSTHOG_CAPTURE_PATH}` };
}

/** Fresh trace identity for one feature invocation (random distinct id). */
export function newAiTrace(): AiTrace {
  return {
    traceId: crypto.randomUUID(),
    distinctId: crypto.randomUUID(),
    sessionId: null,
  };
}

/**
 * Allowlisted event properties. Only the fields listed in the module comment
 * can appear here; anything the caller passes outside the observation shape
 * is unreachable by construction.
 */
export function buildAiGenerationProperties(
  observation: AiGenerationObservation
): AiGenerationProperties {
  const properties: AiGenerationProperties = {
    $ai_trace_id: observation.traceId,
    $ai_span_id: observation.spanId,
    $ai_session_id: observation.sessionId,
    $ai_model: observation.model,
    $ai_provider: observation.provider,
    $ai_latency: Math.round(observation.latencySeconds * 1000) / 1000,
    // A random distinct_id must not create a person profile.
    $process_person_profile: false,
  };

  if (isFiniteNumber(observation.inputTokens)) {
    properties.$ai_input_tokens = observation.inputTokens;
  }
  if (isFiniteNumber(observation.outputTokens)) {
    properties.$ai_output_tokens = observation.outputTokens;
  }
  if (isFiniteNumber(observation.httpStatus)) {
    properties.$ai_http_status = observation.httpStatus;
  }
  if (observation.isError === true) {
    properties.$ai_is_error = true;
  }
  return properties;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * POST one `$ai_generation` to the selected ingestion host.
 *
 * Never throws: transport errors, aborts, non-2xx responses and serialization
 * problems all resolve quietly. No retry is attempted and the request is
 * abandoned after `timeoutMs` (2 s by default).
 */
export async function captureAiGeneration(
  config: PostHogConfig,
  observation: AiGenerationObservation,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? POSTHOG_CAPTURE_TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      api_key: config.token,
      distinct_id: observation.distinctId,
      event: AI_GENERATION_EVENT,
      properties: buildAiGenerationProperties(observation),
    });

    await (options.fetchImpl ?? fetch)(config.captureUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } catch {
    // Telemetry must never change the feature's behavior.
  } finally {
    clearTimeout(timer);
  }
}
