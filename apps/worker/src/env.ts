/** Environment bindings the Worker receives. */
import type { Fetcher, KVNamespace } from '@cloudflare/workers-types';

export interface WorkerEnv {
  /** Gemini API key — a Cloudflare secret. Absent ⇒ Gemini is disabled. */
  GEMINI_API_KEY?: string;
  /** OCR.space API key — a Cloudflare secret. Absent ⇒ /api/scan/ocrspace reports unavailable. */
  OCR_SPACE_API_KEY?: string;
  /** Optional model override (defaults to a documented, current flash model). */
  GEMINI_MODEL?: string;
  /** PostHog project capture token; absent ⇒ AI observability is a no-op. */
  POSTHOG_PROJECT_TOKEN?: string;
  /** PostHog ingestion host: https://us.i.posthog.com or https://eu.i.posthog.com. */
  POSTHOG_HOST?: string;
  /** Static asset binding declared in wrangler.jsonc. */
  ASSETS?: Fetcher;
  /**
   * KV namespace for the scan pipeline (Phase 3): result cache (24h TTL per
   * image SHA-256), Gemini daily counters and the busy marker. OPTIONAL —
   * when unbound, the pipeline runs without cache/quota tracking.
   */
  SCAN_CACHE?: KVNamespace;
}

/**
 * Fetch-compatible function type so tests can inject a stub. Permissive by
 * design: the worker only ever calls it with (url, requestInit).
 */
export type FetchLike = (input: unknown, init?: unknown) => Promise<Response>;
