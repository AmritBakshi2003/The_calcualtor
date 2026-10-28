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

import { normalize, normalizeWithWarnings } from '@calculator-suite/math-core';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { FetchLike, WorkerEnv } from './env';
import { ApiError, readJsonBody } from './http';
import { GeminiApiError, generateContent } from './gemini';
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
  /**
   * Characters this engine's cleanup DROPPED from its own raw output to
   * produce `expression` ("2+3¤5" -> "2+35"). The client is the only one
   * that still knows them, so the server trusts this list (validated, capped)
   * and never verifies a reading that carries any. Optional.
   */
  dropped?: string[];
}

/** One distinct normalized expression, ranked. */
export interface RankedCandidate {
  expression: string;
  /** Best (max) confidence among the candidates that read this expression. */
  confidence: number;
  /** False when NO source reported a confidence at all (unknown, not 0). */
  confidenceKnown: boolean;
  /** Distinct sources that read this expression. */
  sources: string[];
  /** Union of the dropped symbols reported by every source reading this. */
  dropped: string[];
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
  /** Dropped symbols behind `expression` (same group as sources). */
  dropped: string[];
  /**
   * True when every source agreeing on `expression` is a Tesseract variant.
   * Honest agreement, NOT verification (step 3): the arbiter must confirm
   * the reading before it can ship verified:true.
   */
  localConsensus: boolean;
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
    {
      expression: string;
      sources: Set<string>;
      maxConfidence: number;
      confidenceKnown: boolean;
      dropped: string[];
      order: number;
    }
  >();

  for (const candidate of candidates) {
    // Defensive: never trust the caller's cleaning — normalize again.
    const expression = normalize(typeof candidate?.expression === 'string' ? candidate.expression : '');
    if (!expression) continue;
    const source =
      typeof candidate.source === 'string' && candidate.source.trim()
        ? candidate.source.trim()
        : 'unknown';

    const reported =
      typeof candidate?.confidence === 'number' && Number.isFinite(candidate.confidence);
    let group = groups.get(expression);
    if (!group) {
      group = {
        expression,
        sources: new Set(),
        maxConfidence: 0,
        confidenceKnown: false,
        dropped: [],
        order: groups.size,
      };
      groups.set(expression, group);
    }
    group.sources.add(source);
    group.confidenceKnown = group.confidenceKnown || reported;
    group.maxConfidence = Math.max(group.maxConfidence, clampConfidence(candidate.confidence));
    for (const char of candidate.dropped ?? []) {
      if (!group.dropped.includes(char)) group.dropped.push(char);
    }
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
      confidenceKnown: group.confidenceKnown,
      sources: [...group.sources],
      dropped: group.dropped,
    }));
}

/**
 * True when a source label is one of the LOCAL Tesseract variants (the
 * browser sends "tesseract:<variant>-psm<psm>"). Tesseract variants share
 * one engine family: two variants agreeing is far weaker than two
 * independent engines agreeing, so it must never count as verification on
 * its own.
 */
function isTesseractSource(source: string): boolean {
  return source.startsWith('tesseract:');
}

/**
 * The Phase-3 decision rule, pure and offline:
 *  - consensus: some normalized expression was read by >= 2 DIFFERENT
 *    sources, at least one of which is NOT a Tesseract variant (a second
 *    engine, e.g. OCR.space) — ties between qualifying groups go to more
 *    sources, then higher confidence, then first appearance;
 *  - needs_arbiter: no such cross-engine agreement — the top 3 distinct
 *    readings travel to the arbiter instead. A Tesseract-only agreement
 *    still points the arbiter at the agreed reading (localConsensus) so the
 *    arbiter can confirm or refute the best local guess.
 */
export function decide(candidates: ConsensusCandidate[]): Decision {
  const ranked = rankCandidates(candidates);
  const winner = ranked.find(
    (group) => group.sources.length >= 2 && group.sources.some((source) => !isTesseractSource(source))
  );

  if (winner) {
    return {
      outcome: 'consensus',
      expression: winner.expression,
      sources: winner.sources,
      alternatives: ranked.filter((g) => g !== winner).slice(0, 3).map((g) => g.expression),
      topCandidates: ranked.slice(0, 3),
      dropped: winner.dropped,
      localConsensus: false,
    };
  }

  // A >= 2-source group that is ALL Tesseract variants is an honest
  // candidate, not a verification: it drives the arbiter's focus.
  const agreedGroup = ranked.find((group) => group.sources.length >= 2);
  if (agreedGroup) {
    return {
      outcome: 'needs_arbiter',
      expression: agreedGroup.expression,
      sources: agreedGroup.sources,
      alternatives: ranked.filter((g) => g !== agreedGroup).slice(0, 3).map((g) => g.expression),
      topCandidates: ranked.slice(0, 3),
      dropped: agreedGroup.dropped,
      localConsensus: true,
    };
  }

  const best = ranked[0];
  return {
    outcome: 'needs_arbiter',
    expression: best?.expression ?? '',
    sources: best ? best.sources : [],
    alternatives: ranked.slice(1, 4).map((g) => g.expression),
    topCandidates: ranked.slice(0, 3),
    dropped: best ? best.dropped : [],
    localConsensus: false,
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

// ---------------------------------------------------------------------------
// Step 5: the pipeline — parse, cache, decide, (arbiter), respond.
// ---------------------------------------------------------------------------

export const MAX_CANDIDATES = 24;
const MAX_EXPRESSION_CHARS = 300;
const MAX_SOURCE_CHARS = 64;

export interface ConsensusRequestBody {
  image: { base64: string; mime: AllowedImageMime };
  candidates: ConsensusCandidate[];
}

/**
 * Validate the consensus request: the enhanced image (base64/data URI,
 * allowlisted mime) plus the candidate readings. Invalid input throws
 * ApiError(400) — a client bug, not a soft pipeline failure.
 */
export function parseConsensusRequest(body: object): ConsensusRequestBody {
  const record = body as Record<string, unknown>;
  const image = parseConsensusImage(record.image, record.mime);

  if (!Array.isArray(record.candidates)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'candidates must be an array.');
  }
  if (record.candidates.length > MAX_CANDIDATES) {
    throw new ApiError(400, 'VALIDATION_ERROR', `At most ${MAX_CANDIDATES} candidates are accepted.`);
  }

  const candidates: ConsensusCandidate[] = record.candidates.map((raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Each candidate must be an object.');
    }
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.expression !== 'string' || candidate.expression.length > MAX_EXPRESSION_CHARS) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Each candidate needs a string expression (max 300 chars).');
    }
    if (
      candidate.source !== undefined &&
      (typeof candidate.source !== 'string' || candidate.source.length > MAX_SOURCE_CHARS)
    ) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Candidate source must be a short string.');
    }
    if (
      candidate.confidence !== undefined &&
      (typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence))
    ) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Candidate confidence must be a number.');
    }
    if (candidate.dropped !== undefined) {
      const dropped = candidate.dropped;
      if (
        !Array.isArray(dropped) ||
        dropped.length > 12 ||
        dropped.some((item) => typeof item !== 'string' || [...item].length !== 1)
      ) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Candidate dropped must be an array of at most 12 single characters.'
        );
      }
    }
    const droppedList = Array.isArray(candidate.dropped)
      ? [...new Set((candidate.dropped as string[]).filter((item) => typeof item === 'string'))]
      : undefined;
    return {
      expression: candidate.expression,
      source:
        typeof candidate.source === 'string' && candidate.source.trim()
          ? candidate.source.trim()
          : 'unknown',
      confidence:
        typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
          ? candidate.confidence
          : undefined,
      dropped: droppedList && droppedList.length > 0 ? droppedList : undefined,
    };
  });

  return { image, candidates };
}

/**
 * The consensus pipeline for one scan:
 *  1. SHA-256 of the enhanced image -> KV cache; a hit skips EVERYTHING,
 *  2. decide() over the candidate readings,
 *  3. consensus answers directly (verified:true); needs_arbiter goes to the
 *     Gemini arbiter with every protection rule from step 4.
 *
 * Only input validation throws (400/413, like every route); engine and
 * quota failures degrade inside the result (verified:false + stages).
 */
export async function handleConsensus(
  request: Request,
  env: WorkerEnv,
  options: { fetchImpl?: FetchLike } = {}
): Promise<ConsensusResult> {
  return handleConsensusBody(await readJsonBody(request), env, options);
}

/**
 * The pipeline from an already-read JSON body (the route enforces the scan
 * guards — rate limit, body cap, mime allowlist — before parsing).
 */
export async function handleConsensusBody(
  body: object,
  env: WorkerEnv,
  options: { fetchImpl?: FetchLike } = {}
): Promise<ConsensusResult> {
  const parsed = parseConsensusRequest(body);
  const imageBytes = base64ToBytes(parsed.image.base64);
  const key = await cacheKeyFor(imageBytes);
  const kv = env.SCAN_CACHE;

  const hit = await cacheGet(kv, key);
  if (
    hit &&
    typeof hit === 'object' &&
    typeof (hit as ConsensusResult).expression === 'string' &&
    typeof (hit as ConsensusResult).verified === 'boolean'
  ) {
    const cached = hit as ConsensusResult;
    return { ...cached, stages: [...(cached.stages ?? []), 'cache:hit'] };
  }

  const decision = decide(parsed.candidates);
  const stages: string[] = [`decide:${decision.outcome}`];
  // Honest trace: a Tesseract-only agreement went to the arbiter anyway.
  if (decision.localConsensus) stages.push('decide:consensus:local_only');

  const result: ConsensusResult =
    decision.outcome === 'consensus'
      ? {
          expression: decision.expression,
          verified: true,
          sources: decision.sources,
          alternatives: decision.alternatives,
          stages: [...stages],
        }
      : await arbitrate(env, decision, parsed.image, imageBytes, stages, options);

  // Dropping a character silently can change the value ("2+3¤5" -> "2+35"),
  // so a reading with lost symbols is never verified:true, whatever path
  // produced it. The dropped chars come from the engines that dropped them
  // (only the client still knows its own cleanup history) plus a defensive
  // re-check of the final expression.
  const { expression, dropped } = normalizeWithWarnings(result.expression);
  const mergedDropped = [...new Set([...(decision.dropped ?? []), ...dropped])];
  if (expression !== null && mergedDropped.length > 0) {
    result.verified = false;
    result.dropped = mergedDropped;
  }

  // Cache the pipeline result WITHOUT the per-response cache marker, so a
  // hit can append its own 'cache:hit' cleanly.
  await cachePut(kv, key, result);
  return { ...result, stages: ['cache:miss', ...result.stages] };
}

// ---------------------------------------------------------------------------
// Step 4: daily call counters (KV) resetting at midnight Pacific.
// ---------------------------------------------------------------------------

export const DAILY_FLASHLITE_CAP = 450;
export const DAILY_SECOND_OPINION_CAP = 15;
/** How long a 429 marks Gemini busy. */
export const BUSY_MARKER_TTL_SECONDS = 60;
const BUSY_KEY = 'gemini:busy';

/** YYYY-MM-DD in America/Los_Angeles — the counter key rolls at midnight Pacific. */
export function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function readCount(kv: KVNamespace | undefined, key: string): Promise<number> {
  if (!kv) return 0;
  try {
    const value = Number(await kv.get(key));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Best-effort increment; KV counters are SOFT caps (per-isolate races overshoot slightly). */
async function bumpCount(kv: KVNamespace | undefined, key: string): Promise<void> {
  if (!kv) return;
  try {
    const next = (await readCount(kv, key)) + 1;
    await kv.put(key, String(next), { expirationTtl: 48 * 60 * 60 });
  } catch {
    // Quota tracking failures never fail the pipeline.
  }
}

/**
 * Final result shape (Phase 3, step 5): everything the scanner needs to
 * show, flag and debug one scan.
 */
export interface ConsensusResult {
  expression: string;
  /** True ONLY for consensus, or when an arbiter answer matched a candidate. */
  verified: boolean;
  /** Engine/variant sources behind `expression`. */
  sources: string[];
  /** Other distinct readings, best-first, capped at 3. */
  alternatives: string[];
  /** Human-readable pipeline trace, in order. */
  stages: string[];
  /**
   * Characters normalize() had to DROP from the winning expression ("2+3¤5"
   * -> "2+35"). Dropping can change the value, so any non-empty list forces
   * `verified: false` — the UI shows "Some symbols were not recognized".
   * Present only when something was dropped.
   */
  dropped?: string[];
}

// ---------------------------------------------------------------------------
// Step 3: the Gemini arbiter — called ONLY on needs_arbiter.
// ---------------------------------------------------------------------------

export const ARBITER_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
export const ARBITER_SECOND_MODEL = 'gemini-3.8-flash';
export const ARBITER_MAX_OUTPUT_TOKENS = 200;
/** The arbiter's input image must already be resized to this long side. */
export const ARBITER_IMAGE_MAX_SIDE = 1024;

/**
 * Image dimensions from the bytes (PNG IHDR, JPEG SOF markers) so the
 * server can enforce the 1024px-long-side arbiter limit without a canvas.
 * Returns null for unknown formats (e.g. WebP) — those are trusted to the
 * client's resize step.
 */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8],
        };
      }
      i += 2 + length;
    }
  }
  return null;
}

const ARBITER_SYSTEM_INSTRUCTION =
  'You read arithmetic expressions from images of calculator screens, paper and screenshots. ' +
  'Answer with the requested JSON object only — no prose, no Markdown fences.';

/**
 * The arbiter payload: read the expression from the image YOURSELF; the
 * candidates may be wrong; answer only JSON.
 */
export function buildArbiterPrompt(topCandidates: RankedCandidate[]): string {
  const lines = topCandidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.expression}" (confidence ${Math.round(c.confidence)}, source ${c.sources.join(' + ')})`
    )
    .join('\n');
  return (
    'Read the arithmetic expression from the image yourself. ' +
    'The candidate readings below may be wrong — trust your own reading of the image.\n\n' +
    `Candidate readings:\n${lines || '(none)'}\n\n` +
    'Answer ONLY a JSON object, no other text:\n' +
    '{"expression": string, "confidence": number, "alternatives": string[]}\n' +
    'expression: what is printed in the image (digits and + - * / x × ÷ ( ) . =). ' +
    'confidence: 0-100. alternatives: other plausible readings, possibly empty.'
  );
}

export interface ArbiterAnswer {
  /** The arbiter's own reading. */
  expression: string;
  /** 0-100, clamped; missing/invalid becomes 0. */
  confidence: number;
  alternatives: string[];
}

export class ArbiterParseError extends Error {}

/**
 * Parse the arbiter answer defensively: tolerate Markdown fences and stray
 * prose around the JSON object, validate every field, clamp confidence.
 * Throws ArbiterParseError on anything unusable — never trusts the model.
 */
export function parseArbiterAnswer(text: string): ArbiterAnswer {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines.length > 0 && lines[0].startsWith('```')) lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    cleaned = lines.join('\n').trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new ArbiterParseError('no JSON object in the answer');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new ArbiterParseError('answer is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ArbiterParseError('answer is not a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.expression !== 'string' || !record.expression.trim()) {
    throw new ArbiterParseError('answer has no usable expression');
  }
  const alternatives = Array.isArray(record.alternatives)
    ? record.alternatives
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 5)
    : [];
  return {
    expression: record.expression.trim(),
    confidence: clampConfidence(record.confidence),
    alternatives,
  };
}

export type ArbiterCallStatus = 'match' | 'no_match' | 'parse_failed' | 'busy' | 'error';

export interface ArbiterCallResult {
  status: ArbiterCallStatus;
  model: string;
  /** Present when status is match/no_match: the normalized answer. */
  answer?: ArbiterAnswer & { expression: string };
}

/**
 * One arbiter model call. temperature 0 and the 200-token cap are set per
 * call; a 5xx is retried once INSIDE generateContent (never a 429 — that is
 * surfaced as 'busy' so the caller can stop for the day); a 404/other
 * failure is a plain 'error'. The answer is normalized and matched against
 * the candidate expressions here.
 */
export async function callArbiterModel(
  env: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string },
  model: string,
  image: { base64: string; mime: AllowedImageMime },
  prompt: string,
  candidateExpressions: string[],
  options: { fetchImpl?: FetchLike } = {}
): Promise<ArbiterCallResult> {
  try {
    const text = await generateContent(
      env,
      {
        parts: [
          { inline_data: { mime_type: image.mime, data: image.base64 } },
          { text: prompt },
        ],
        systemInstruction: ARBITER_SYSTEM_INSTRUCTION,
      },
      { fetchImpl: options.fetchImpl, model, maxOutputTokens: ARBITER_MAX_OUTPUT_TOKENS }
    );
    try {
      const answer = parseArbiterAnswer(text);
      const normalized = normalize(answer.expression);
      if (!normalized) {
        // The model answered, but outside the scan alphabet: unusable.
        return { status: 'parse_failed', model };
      }
      return {
        status: candidateExpressions.includes(normalized) ? 'match' : 'no_match',
        model,
        answer: { ...answer, expression: normalized },
      };
    } catch {
      return { status: 'parse_failed', model };
    }
  } catch (error) {
    if (error instanceof GeminiApiError && error.code === 'rate_limited') {
      // 429: no retry. The caller marks Gemini busy.
      return { status: 'busy', model };
    }
    return { status: 'error', model };
  }
}

// ---------------------------------------------------------------------------
// Step 4 (flow): run the arbiter with all its protection rules.
// ---------------------------------------------------------------------------

function arbiterFallback(decision: Decision, stages: string[]): ConsensusResult {
  const best = decision.topCandidates[0];
  return {
    expression: best?.expression ?? '',
    verified: false,
    // Honest labeling: whatever shipped here was NOT cross-checked by
    // Gemini, so "local-only" always travels with the engine list.
    sources: best ? [...best.sources, 'local-only'] : ['local-only'],
    alternatives: decision.topCandidates.slice(1, 4).map((c) => c.expression),
    stages,
  };
}

/**
 * The Gemini arbiter, gated by every protection rule:
 *  - skipped entirely when the image exceeds the 1024px long side (the
 *    client resizes; the server refuses to upload oversized crops),
 *  - skipped while a previous 429 left the busy marker up,
 *  - skipped once the flash-lite daily counter is past its soft cap (450,
 *    resetting midnight Pacific) — the best OCR reading ships, verified:false,
 *  - flash-lite first; only when it matches NO candidate, one second opinion
 *    with gemini-3.8-flash, under its own 15/day cap,
 *  - a matching answer makes the result verified:true and joins the sources.
 */
export async function arbitrate(
  env: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; SCAN_CACHE?: KVNamespace },
  decision: Decision,
  image: { base64: string; mime: AllowedImageMime },
  imageBytes: Uint8Array,
  stages: string[],
  options: { fetchImpl?: FetchLike } = {}
): Promise<ConsensusResult> {
  if (!env.GEMINI_API_KEY?.trim()) {
    stages.push('arbiter:skipped:not_configured');
    return arbiterFallback(decision, stages);
  }

  const dims = imageDimensions(imageBytes);
  if (dims && Math.max(dims.width, dims.height) > ARBITER_IMAGE_MAX_SIDE) {
    stages.push('arbiter:skipped:image_too_large');
    return arbiterFallback(decision, stages);
  }

  const kv = env.SCAN_CACHE;
  if (kv) {
    try {
      if (await kv.get(BUSY_KEY)) {
        stages.push('arbiter:skipped:busy');
        return arbiterFallback(decision, stages);
      }
    } catch {
      // Busy-marker read failure is not a reason to skip.
    }
  }

  const dayKey = pacificDateKey();
  const flashLiteCount = await readCount(kv, `gemini:flashlite:${dayKey}`);
  if (flashLiteCount >= DAILY_FLASHLITE_CAP) {
    stages.push('arbiter:skipped:daily_cap');
    return arbiterFallback(decision, stages);
  }
  await bumpCount(kv, `gemini:flashlite:${dayKey}`);

  const candidateExpressions = decision.topCandidates.map((c) => c.expression);
  const prompt = buildArbiterPrompt(decision.topCandidates);
  const primary = await callArbiterModel(
    env,
    ARBITER_PRIMARY_MODEL,
    image,
    prompt,
    candidateExpressions,
    options
  );

  switch (primary.status) {
    case 'match':
      stages.push(`arbiter:${ARBITER_PRIMARY_MODEL}:match`);
      return {
        expression: primary.answer!.expression,
        verified: true,
        sources: [...(decision.topCandidates[0]?.sources ?? []), `gemini:${ARBITER_PRIMARY_MODEL}`],
        alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
        stages,
      };
    case 'busy':
      stages.push(`arbiter:${ARBITER_PRIMARY_MODEL}:429:busy`);
      if (kv) {
        try {
          await kv.put(BUSY_KEY, '1', { expirationTtl: BUSY_MARKER_TTL_SECONDS });
        } catch {
          // Busy marking is best-effort.
        }
      }
      return arbiterFallback(decision, stages);
    case 'error':
      // 5xx already retried once inside generateContent; still failing.
      stages.push(`arbiter:${ARBITER_PRIMARY_MODEL}:error`);
      return arbiterFallback(decision, stages);
    case 'parse_failed':
      stages.push(`arbiter:${ARBITER_PRIMARY_MODEL}:parse_failed`);
      break;
    case 'no_match':
      stages.push(`arbiter:${ARBITER_PRIMARY_MODEL}:no_match`);
      break;
  }

  // Weak candidates (P3): Tesseract produced nothing, or every explicit
  // confidence is below 25 — the "local readings" are garbage, so a second
  // opinion against them is worthless. Do NOT spend the 15/day cap on it:
  // Gemini's own reading IS the answer (unverified — nothing local agreed
  // with it). With no usable Gemini reading either, the local best ships
  // unverified as always.
  const weakCandidates =
    decision.topCandidates.length === 0 ||
    decision.topCandidates.every((c) => (c.confidenceKnown ? c.confidence : Infinity) < 25);
  if (weakCandidates) {
    stages.push('arbiter:second:skipped:weak_candidates');
    if (primary.answer) {
      return {
        expression: primary.answer.expression,
        verified: false,
        sources: [`gemini:${ARBITER_PRIMARY_MODEL}`],
        alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
        stages,
      };
    }
    return arbiterFallback(decision, stages);
  }

  const secondCount = await readCount(kv, `gemini:second:${dayKey}`);
  if (secondCount >= DAILY_SECOND_OPINION_CAP) {
    stages.push('arbiter:second:skipped:cap');
    return arbiterFallback(decision, stages);
  }
  await bumpCount(kv, `gemini:second:${dayKey}`);

  const second = await callArbiterModel(
    env,
    ARBITER_SECOND_MODEL,
    image,
    prompt,
    candidateExpressions,
    options
  );

  switch (second.status) {
    case 'match':
      stages.push(`arbiter:${ARBITER_SECOND_MODEL}:match`);
      return {
        expression: second.answer!.expression,
        verified: true,
        sources: [...(decision.topCandidates[0]?.sources ?? []), `gemini:${ARBITER_SECOND_MODEL}`],
        alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
        stages,
      };
    case 'no_match':
    case 'parse_failed':
      // Two independent arbiter readings, neither matching a candidate: the
      // newest reading ships unverified, the OCR readings stay as alternatives.
      stages.push(`arbiter:${ARBITER_SECOND_MODEL}:${second.status}`);
      return {
        expression: second.answer?.expression ?? decision.expression,
        verified: false,
        sources: [`gemini:${ARBITER_SECOND_MODEL}`],
        alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
        stages,
      };
    case 'busy':
      stages.push(`arbiter:${ARBITER_SECOND_MODEL}:429:busy`);
      if (kv) {
        try {
          await kv.put(BUSY_KEY, '1', { expirationTtl: BUSY_MARKER_TTL_SECONDS });
        } catch {
          // Best-effort.
        }
      }
      // The primary produced a parseable reading: it must NOT be discarded
      // just because the second model could not run — an empty result is
      // worse than an honest unverified one (P3).
      if (primary.answer) {
        return {
          expression: primary.answer.expression,
          verified: false,
          sources: [`gemini:${ARBITER_PRIMARY_MODEL}`],
          alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
          stages,
        };
      }
      return arbiterFallback(decision, stages);
    case 'error':
    default:
      stages.push(`arbiter:${ARBITER_SECOND_MODEL}:error`);
      // Same rule: the primary's own reading survives a second-model
      // timeout/failure; only when the primary had none does the local best
      // ship.
      if (primary.answer) {
        return {
          expression: primary.answer.expression,
          verified: false,
          sources: [`gemini:${ARBITER_PRIMARY_MODEL}`],
          alternatives: decision.topCandidates.slice(0, 3).map((c) => c.expression),
          stages,
        };
      }
      return arbiterFallback(decision, stages);
  }
}
