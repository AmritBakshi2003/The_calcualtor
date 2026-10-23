import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { scanLimiter } from '../src/index';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { WorkerEnv } from '../src/env';
import {
  ARBITER_PRIMARY_MODEL,
  ARBITER_SECOND_MODEL,
  DAILY_FLASHLITE_CAP,
  DAILY_SECOND_OPINION_CAP,
  decide,
  pacificDateKey,
  type ConsensusCandidate,
} from '../src/consensus';

const ROOT = 'https://calc.example.com';
// A 1x1 PNG (valid base64, tiny).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Map-backed KV stub (TTL ignored; counters read like the pipeline does). */
function makeKv() {
  const map = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    map,
  } as unknown as KVNamespace & { map: Map<string, string> };
}

function geminiJson(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }], finishReason: 'STOP' } }] }),
    { status: 200 }
  );
}

function arbiterAnswerJson(expression: string, confidence = 80): string {
  return `{"expression": "${expression}", "confidence": ${confidence}, "alternatives": []}`;
}

function makeFetchMock() {
  return vi.fn(async (_input: unknown, _init?: unknown): Promise<Response> => {
    throw new Error('unexpected upstream call');
  });
}

interface EnvOptions {
  kv?: KVNamespace;
  geminiKey?: string;
}

function makeEnv({ kv, geminiKey = 'test-gemini-key' }: EnvOptions = {}): WorkerEnv {
  return { GEMINI_API_KEY: geminiKey, SCAN_CACHE: kv } as unknown as WorkerEnv;
}

function post(body: unknown, env: WorkerEnv): Promise<Response> {
  return worker.fetch(
    new Request(`${ROOT}/api/scan/consensus`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env
  );
}

const consensusBody = (candidates: ConsensusCandidate[]) => ({
  image: PNG_BASE64,
  mime: 'image/png',
  candidates,
});

beforeEach(() => {
  scanLimiter.reset(); // 10 scans/min per IP would trip across tests
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decide (pure)', () => {
  it('declares consensus when >= 2 distinct sources agree on the normalized expression', () => {
    const result = decide([
      { expression: '2 x 3', source: 'tesseract:grayscale-psm7', confidence: 55 },
      { expression: '2×3', source: 'ocrspace', confidence: 90 },
    ]);
    expect(result.outcome).toBe('consensus');
    expect(result.expression).toBe('2×3');
    expect(result.sources).toEqual(['tesseract:grayscale-psm7', 'ocrspace']);
  });

  it('does not count repeated candidates from ONE source as consensus', () => {
    const result = decide([
      { expression: '2+3', source: 'tesseract:grayscale-psm7', confidence: 55 },
      { expression: '2+3', source: 'tesseract:grayscale-psm7', confidence: 60 },
    ]);
    expect(result.outcome).toBe('needs_arbiter');
    expect(result.expression).toBe('2+3');
  });

  it('counts different variant labels as different sources', () => {
    const result = decide([
      { expression: '2+3', source: 'tesseract:grayscale-psm7' },
      { expression: '2+3', source: 'tesseract:grayscale-psm13' },
    ]);
    expect(result.outcome).toBe('consensus');
  });

  it('ranks consensus by distinct sources, then confidence', () => {
    const result = decide([
      { expression: '2++3', source: 'tesseract:a' }, // junk: normalize rejects
      { expression: '12+34', source: 'tesseract:b', confidence: 40 },
      { expression: '12+34', source: 'tesseract:c', confidence: 45 },
      { expression: '9÷2', source: 'ocrspace', confidence: 70 },
      { expression: '144/12', source: 'tesseract:d', confidence: 30 },
    ]);
    // 12+34 has two distinct sources -> consensus over the confident 9÷2.
    expect(result.outcome).toBe('consensus');
    expect(result.expression).toBe('12+34');
    expect(result.alternatives).toEqual(['9÷2', '144/12']);
  });

  it('needs_arbiter when no expression has two distinct sources, with the top 3', () => {
    const result = decide([
      { expression: '12+34', source: 'tesseract:grayscale-psm7', confidence: 50 },
      { expression: '12+34', source: 'tesseract:grayscale-psm7', confidence: 60 }, // same source
      { expression: '9÷2', source: 'ocrspace', confidence: 70 },
      { expression: '5-1', source: 'gemini:x', confidence: 10 },
      { expression: '8-2', source: 'gemini:y', confidence: 5 },
    ]);
    expect(result.outcome).toBe('needs_arbiter');
    expect(result.expression).toBe('9÷2'); // highest confidence wins the ranking
    expect(result.topCandidates.map((c) => c.expression)).toEqual(['9÷2', '12+34', '5-1']);
    expect(result.topCandidates).toHaveLength(3);
  });

  it('handles empty and junk candidate lists', () => {
    const empty = decide([]);
    expect(empty.outcome).toBe('needs_arbiter');
    expect(empty.expression).toBe('');

    const junk = decide([{ expression: 'RECEIPT', source: 'ocrspace' }]);
    expect(junk.outcome).toBe('needs_arbiter');
    expect(junk.expression).toBe('');
  });
});

describe('POST /api/scan/consensus', () => {
  it('acceptance: with all engines agreeing, Gemini is never called', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([
        { expression: '2+3', source: 'tesseract:grayscale-psm7', confidence: 55 },
        { expression: '2+3', source: 'ocrspace', confidence: 90 },
      ]),
      makeEnv({ kv: makeKv() })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.expression).toBe('2+3');
    expect(body.verified).toBe(true);
    expect(body.sources).toEqual(['tesseract:grayscale-psm7', 'ocrspace']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acceptance: with disagreement, Gemini is called exactly once', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(geminiJson(arbiterAnswerJson('2+3')));
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7', confidence: 55 }]),
      makeEnv({ kv: makeKv() })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(true); // arbiter matched the candidate
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`${ARBITER_PRIMARY_MODEL}:generateContent`);
  });

  it('a cache hit skips everything (no decide, no arbiter, no quota)', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(geminiJson(arbiterAnswerJson('2+3')));
    vi.stubGlobal('fetch', fetchMock);
    const kv = makeKv();
    const env = makeEnv({ kv });

    const first = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      env
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // arbiter ran
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody.stages).toContain('cache:miss');

    const second = await post(
      consensusBody([{ expression: 'TOTALLY-DIFFERENT', source: 'ocrspace' }]),
      env
    );
    // Same image -> same SHA-256 -> cache hit, even with different candidates.
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(secondBody.expression).toBe(firstBody.expression);
    expect(secondBody.stages).toContain('cache:hit');
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing ran again
  });

  it('skips the arbiter once the flash-lite daily cap is reached', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const kv = makeKv();
    kv.map.set(`gemini:flashlite:${pacificDateKey()}`, String(DAILY_FLASHLITE_CAP));

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      makeEnv({ kv })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(false);
    expect(body.expression).toBe('2+3'); // best OCR reading ships
    expect(body.stages).toContain('arbiter:skipped:daily_cap');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on 429: no retry, busy marker set, and the next scan skips the arbiter', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const kv = makeKv();
    const env = makeEnv({ kv });
    const candidates = consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]);

    const first = await post(candidates, env);
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody.verified).toBe(false);
    expect(firstBody.expression).toBe('2+3');
    expect(firstBody.stages).toContain(`arbiter:${ARBITER_PRIMARY_MODEL}:429:busy`);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on 429
    expect(kv.map.get('gemini:busy')).toBe('1');

    // A different image so the cache cannot short-circuit the busy check.
    const second = await post(
      {
        image:
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mNkYPhfDgAChwGA60e6kgAAAABJRU5ErkJggg==',
        mime: 'image/png',
        candidates: candidates.candidates,
      },
      env
    );
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(secondBody.stages).toContain('arbiter:skipped:busy');
    expect(fetchMock).toHaveBeenCalledTimes(1); // second scan called nothing
  });

  it('parse failure falls through to the second opinion (and matches there)', async () => {
    const fetchMock = makeFetchMock();
    fetchMock
      .mockResolvedValueOnce(geminiJson('I read the image but cannot produce JSON.'))
      .mockResolvedValueOnce(geminiJson(`Sure! ${arbiterAnswerJson('2+3')}`)); // fenced/prose-wrapped
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      makeEnv({ kv: makeKv() })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`${ARBITER_SECOND_MODEL}:generateContent`);
    const stages = body.stages as string[];
    expect(stages).toContain(`arbiter:${ARBITER_PRIMARY_MODEL}:parse_failed`);
    expect(stages).toContain(`arbiter:${ARBITER_SECOND_MODEL}:match`);
  });

  it('two parse failures ship the best OCR reading unverified', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(geminiJson('no json here'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([
        { expression: '2+3', source: 'tesseract:grayscale-psm7' },
        { expression: '2+8', source: 'ocrspace' },
      ]),
      makeEnv({ kv: makeKv() })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(false);
    expect(body.expression).toBe('2+3'); // best-ranked OCR reading
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a 5xx is retried once inside generateContent, then the answer is used', async () => {
    const fetchMock = makeFetchMock();
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(geminiJson(arbiterAnswerJson('2+3')));
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      makeEnv({ kv: makeKv() })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one 5xx retry, no more
  });

  it('the second opinion has its own daily cap', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(geminiJson(arbiterAnswerJson('9÷2'))); // matches no candidate
    vi.stubGlobal('fetch', fetchMock);
    const kv = makeKv();
    kv.map.set(`gemini:second:${pacificDateKey()}`, String(DAILY_SECOND_OPINION_CAP));

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      makeEnv({ kv })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(false);
    expect(body.stages).toContain('arbiter:second:skipped:cap');
    expect(fetchMock).toHaveBeenCalledTimes(1); // flash-lite only
  });

  it('skips the arbiter without a Gemini key (best OCR, verified:false)', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(
      consensusBody([{ expression: '2+3', source: 'tesseract:grayscale-psm7' }]),
      makeEnv({ kv: makeKv(), geminiKey: '' })
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verified).toBe(false);
    expect(body.stages).toContain('arbiter:skipped:not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects bodies over the 4 MB cap with 413', async () => {
    // On Requests without a Content-Length the server cannot pre-check, so
    // this exercises the declared-length path like production clients do.
    const big = 'x'.repeat(4 * 1024 * 1024 + 1);
    const response = await worker.fetch(
      new Request(`${ROOT}/api/scan/consensus`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(big.length) },
        body: JSON.stringify({ image: PNG_BASE64, mime: 'image/png', pad: big.slice(0, 10) }),
      }),
      makeEnv()
    );
    expect(response.status).toBe(413);
  });

  it('enforces the image content-type allowlist', async () => {
    expect(
      (await post({ image: `data:image/gif;base64,${PNG_BASE64}`, candidates: [] }, makeEnv())).status
    ).toBe(400);
    expect(
      (await post({ image: PNG_BASE64, mime: 'image/gif', candidates: [] }, makeEnv())).status
    ).toBe(400);
  });

  it('limits scans to 10 per minute per IP', async () => {
    scanLimiter.reset();
    vi.stubGlobal('fetch', makeFetchMock());
    const env = makeEnv({ kv: makeKv() });
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await post(consensusBody([{ expression: '2+3', source: 'tesseract:a' }]), env);
    }
    expect(last?.status).toBe(429);
  });

  it('validates the candidate array strictly', async () => {
    expect((await post({ image: PNG_BASE64, mime: 'image/png' }, makeEnv())).status).toBe(400);
    expect((await post({ image: PNG_BASE64, mime: 'image/png', candidates: 'nope' }, makeEnv())).status).toBe(400);
    expect(
      (
        await post(
          { image: PNG_BASE64, mime: 'image/png', candidates: [{ source: 'x' }] },
          makeEnv()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await post(
          {
            image: PNG_BASE64,
            mime: 'image/png',
            candidates: Array.from({ length: 25 }, (_, i) => ({
              expression: String(i),
              source: 's',
            })),
          },
          makeEnv()
        )
      ).status
    ).toBe(400);
  });
});
