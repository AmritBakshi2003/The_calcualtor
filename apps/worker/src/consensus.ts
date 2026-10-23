/**
 * Consensus pipeline for the scanner (Phase 3).
 *
 * The browser sends every normalized reading it produced (Tesseract variant
 * passes, and the OCR.space engine result) as candidates. This module:
 *
 *  1. `decide()` — pure: consensus when >= 2 DISTINCT sources agree on the
 *     same normalized expression, otherwise `needs_arbiter` with the top 3
 *     distinct readings,
 *  2. a SHA-256 image cache in KV (TTL 24h, a hit skips everything),
 *  3. the Gemini arbiter, called ONLY on `needs_arbiter`,
 *  4. daily call counters in KV, resetting at midnight Pacific.
 *
 * Pure helpers are exported for unit tests; the pipeline is wired into
 * `POST /api/scan/consensus` in index.ts.
 */

import { normalize } from '@calculator-suite/math-core';
import type { KVNamespace } from '@cloudflare/workers-types';
import { ApiError } from './http';
import { parseImageField } from './ocrspace';
import type { AllowedImageMime } from './recognize';

/** One reading from one engine/variant. `source` labels are free-form but
 * MUST differ between engines/variants for consensus to count them. */
export interface ConsensusCandidate {
  /** Raw reading; normalized defensively inside decide(). */
  expression: string;
  /** Optional recognition confidence 0-100. */
  confidence?: number;
  /** Engine/variant label, e.g. "tesseract:grayscale-psm7", "ocrspace". */
  source: string;
}

/** One distinct normalized expression, ranked. */
export interface RankedCandidate {
  expression: string;
  /** Best (max) confidence among the candidates that read this expression. */
  confidence: number;
  /** Distinct sources that read this expression. */
  sources: string[];
}

export type Decision = {
  outcome: 'consensus' | 'needs_arbiter';
  /** Winning expression (consensus) or best-ranked reading (needs_arbiter). */
  expression: string;
  /** Sources behind `expression`. */
  sources: string[];
  /** Other distinct readings, best-first, capped at 3. */
  alternatives: string[];
  /** Top 3 distinct ranked candidates — the arbiter's input. */
  topCandidates: RankedCandidate[];
};

function clampConfidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
}

/**
 * Rank readings best-first: most distinct sources, then best confidence,
 * then order of first appearance (stable, so identical inputs stay
 * predictable).
 */
export function rankCandidates(candidates: ConsensusCandidate[]): RankedCandidate[] {
  const groups = new Map<
    string,
    { expression: string; sources: Set<string>; maxConfidence: number; order: number }
  >();

  for (const candidate of candidates) {
    // Defensive: never trust the caller's cleaning — normalize again.
    const expression = normalize(typeof candidate?.expression === 'string' ? candidate.expression : '');
    if (!expression) continue;
    const source =
      typeof candidate.source === 'string' && candidate.source.trim()
        ? candidate.source.trim()
        : 'unknown';

    let group = groups.get(expression);
    if (!group) {
      group = { expression, sources: new Set(), maxConfidence: 0, order: groups.size };
      groups.set(expression, group);
    }
    group.sources.add(source);
    group.maxConfidence = Math.max(group.maxConfidence, clampConfidence(candidate.confidence));
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.sources.size - a.sources.size ||
        b.maxConfidence - a.maxConfidence ||
        a.order - b.order
    )
    .map((group) => ({
      expression: group.expression,
      confidence: group.maxConfidence,
      sources: [...group.sources],
    }));
}

/**
 * The Phase-3 decision rule, pure and offline:
 *  - consensus: some normalized expression was read by >= 2 DIFFERENT
 *    sources (engines or variants); ties between qualifying groups go to
 *    more sources, then higher confidence, then first appearance;
 *  - needs_arbiter: no such agreement — the top 3 distinct readings travel
 *    to the arbiter instead.
 */
export function decide(candidates: ConsensusCandidate[]): Decision {
  const ranked = rankCandidates(candidates);
  const winner = ranked.find((group) => group.sources.length >= 2);

  if (winner) {
    return {
      outcome: 'consensus',
      expression: winner.expression,
      sources: winner.sources,
      alternatives: ranked.filter((g) => g !== winner).slice(0, 3).map((g) => g.expression),
      topCandidates: ranked.slice(0, 3),
    };
  }

  const best = ranked[0];
  return {
    outcome: 'needs_arbiter',
    expression: best?.expression ?? '',
    sources: best ? best.sources : [],
    alternatives: ranked.slice(1, 4).map((g) => g.expression),
    topCandidates: ranked.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Step 2: SHA-256 image cache (KV, TTL 24h — a hit skips everything).
// ---------------------------------------------------------------------------

export const CACHE_TTL_SECONDS = 24 * 60 * 60;
export const CACHE_KEY_PREFIX = 'scan:v1:';

/** Decoded image bytes from standard base64 (charset already validated). */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lowercase hex SHA-256 of the image bytes — the cache key material. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cacheKeyFor(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes).then((hex) => `${CACHE_KEY_PREFIX}${hex}`);
}

/** Cache read: null on miss, unbound KV, or an unreadable entry. */
export async function cacheGet(kv: KVNamespace | undefined, key: string): Promise<unknown | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Cache write: best-effort — a failing KV can never fail the pipeline. */
export async function cachePut(
  kv: KVNamespace | undefined,
  key: string,
  value: object
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
  } catch {
    // Cache write failures are invisible to the caller.
  }
}

/**
 * Validate the consensus request's image: bare base64 or a data URI, mime
 * from the data URI or an explicit allowlisted `mime` field, decoded size
 * capped below the 4 MB body cap. Invalid input is a 400/413 ApiError.
 */
export function parseConsensusImage(
  image: unknown,
  explicitMime: unknown
): { base64: string; mime: AllowedImageMime } {
  if (typeof image !== 'string' || image.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'image is required.');
  }
  return parseImageField(image, explicitMime, 'image', 3 * 1024 * 1024);
}
