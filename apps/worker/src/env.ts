/** Environment bindings the Worker receives. */
import type { Fetcher } from '@cloudflare/workers-types';

export interface WorkerEnv {
  /** Gemini API key — a Cloudflare secret. Absent ⇒ Gemini is disabled. */
  GEMINI_API_KEY?: string;
  /** Optional model override (defaults to a documented, current flash model). */
  GEMINI_MODEL?: string;
  /** PostHog project capture token; absent ⇒ AI observability is a no-op. */
  POSTHOG_PROJECT_TOKEN?: string;
  /** PostHog ingestion host: https://us.i.posthog.com or https://eu.i.posthog.com. */
  POSTHOG_HOST?: string;
  /** Static asset binding declared in wrangler.jsonc. */
  ASSETS?: Fetcher;
}

/**
 * Fetch-compatible function type so tests can inject a stub. Permissive by
 * design: the worker only ever calls it with (url, requestInit).
 */
export type FetchLike = (input: unknown, init?: unknown) => Promise<Response>;
