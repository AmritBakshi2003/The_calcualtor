import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { WorkerEnv } from '../src/env';

const envNoKey = {} as WorkerEnv;
const env = { GEMINI_API_KEY: 'test-key' } as WorkerEnv;
const ROOT = 'https://calc.example.com';

function geminiJson(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }], finishReason: 'STOP' } }] }),
    { status: 200 }
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => geminiJson('144/12')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`${ROOT}${path}`), env);
}

function post(path: string, body: unknown, origin?: string, useEnv: WorkerEnv = env): Promise<Response> {
  return worker.fetch(
    new Request(`${ROOT}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(body),
    }),
    useEnv
  );
}

describe('non-API paths', () => {
  it('falls through to the asset binding', async () => {
    const envWithAssets = {
      ...env,
      ASSETS: { fetch: async () => new Response('SPA', { status: 200 }) },
    } as unknown as WorkerEnv;
    const response = await worker.fetch(new Request(`${ROOT}/`), envWithAssets);
    expect(await response.text()).toBe('SPA');
  });
});

describe('GET /api/scan/capabilities', () => {
  it('reports Gemini off without a key', async () => {
    const response = await worker.fetch(new Request(`${ROOT}/api/scan/capabilities`), envNoKey);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gemini: false });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('reports Gemini on with a key', async () => {
    const response = await get('/api/scan/capabilities');
    expect(await response.json()).toEqual({ gemini: true });
  });
});

describe('POST /api/scan/recognize', () => {
  const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('cross-validates the Tesseract hint and returns the corrected expression', async () => {
    const response = await post('/api/scan/recognize', {
      image: IMAGE,
      mime: 'image/png',
      hint: '144+12 (misread)',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expression: '144/12', source: 'gemini', unreadable: false });
  });

  it('rejects foreign origins before touching the model', async () => {
    const response = await post('/api/scan/recognize', { image: IMAGE, mime: 'image/png', hint: null }, 'https://evil.example');
    expect(response.status).toBe(403);
  });

  it('degrades gracefully when the key is missing', async () => {
    const response = await post(
      '/api/scan/recognize',
      { image: IMAGE, mime: 'image/png', hint: null },
      undefined,
      envNoKey
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'gemini_not_configured' });
  });
});

describe('POST /api/solve/complex', () => {
  it('refuses simple arithmetic so local evaluation stays free', async () => {
    const response = await post('/api/solve/complex', { question: '2+3' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'CLIENT_EVALUABLE' });
  });

  it('solves a word problem via Gemini', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiJson('52.5')));
    const response = await post('/api/solve/complex', { question: 'what is 15% of 350?' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: '52.5', source: 'gemini' });
  });

  it('maps rate limits to 429 with a retryable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    const response = await post('/api/solve/complex', { question: 'sqrt(2)^10+log(100)' });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'rate_limited' });
  });
});

describe('unknown API routes', () => {
  it('404s', async () => {
    expect((await get('/api/nope')).status).toBe(404);
  });
});
