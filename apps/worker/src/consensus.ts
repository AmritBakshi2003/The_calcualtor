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
