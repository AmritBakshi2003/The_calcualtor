import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downscaleDimensions,
  fetchGeminiCapabilities,
  GeminiUnavailableError,
  recognizeWithGemini,
  resetCapabilitiesCache,
  solveWithGemini,
} from './geminiClient';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function jsonResponse(status: number, body: object | string): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('downscaleDimensions', () => {
  it('keeps small images untouched', () => {
    expect(downscaleDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('scales the long side down', () => {
    expect(downscaleDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(downscaleDimensions(3000, 3000, 2000)).toEqual({ width: 2000, height: 2000 });
  });
});

describe('fetchGeminiCapabilities', () => {
  beforeEach(() => {
    resetCapabilitiesCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCapabilitiesCache();
  });

  it('reports gemini true only for an explicit true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { gemini: true }))
    );
    expect(await fetchGeminiCapabilities()).toEqual({ gemini: true });
  });

  it('treats any missing/failed probe as local-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, '<html>SPA</html>')));
    expect(await fetchGeminiCapabilities()).toEqual({ gemini: false });
    fetch = undefined;
    expect(await fetchGeminiCapabilities()).toEqual({ gemini: false });
  });
});

describe('recognizeWithGemini', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('splits the data URL and posts image + hint', async () => {
    const spy = vi.fn(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.image.startsWith('iVBORw0KGgo')).toBe(true);
      expect(body.mime).toBe('image/png');
      expect(body.hint).toBe('12+34');
      return jsonResponse(200, { expression: '12+34', unreadable: false });
    });
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const result = await recognizeWithGemini(PNG_1PX, '12+34');
    expect(result).toEqual({ expression: '12+34', unreadable: false, verified: false });
  });

  it('posts the enhanced crop when provided and reads the verified flag', async () => {
    const spy = vi.fn(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.enhanced).toBe('ENHANCEDPAYLOAD');
      expect(body.hint).toBe(null);
      return jsonResponse(200, { expression: '189+82', unreadable: false, verified: true });
    });
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const enhanced = 'data:image/png;base64,ENHANCEDPAYLOAD';
    const result = await recognizeWithGemini(PNG_1PX, null, enhanced);
    expect(result).toEqual({ expression: '189+82', unreadable: false, verified: true });
  });

  it('keeps working when a bad enhanced data URL is passed', async () => {
    const spy = vi.fn(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.enhanced).toBe(null);
      return jsonResponse(200, { expression: '189+82', unreadable: false, verified: false });
    });
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const result = await recognizeWithGemini(PNG_1PX, null, 'not-a-data-url');
    expect(result).toEqual({ expression: '189+82', unreadable: false, verified: false });
  });

  it('maps server unavailability onto typed errors', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(503, { error: 'gemini_not_configured' }));
    await expect(recognizeWithGemini(PNG_1PX, null)).rejects.toBeInstanceOf(GeminiUnavailableError);
  });

  it('parses the model\'s uncertain flags (step 5 JSON contract)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          expression: '√(16)',
          unreadable: false,
          verified: true,
          uncertain: [
            { index: 0, char: '√', alternatives: ['V', '4'] }, // valid
            { index: -1, char: 'x', alternatives: ['y'] }, // dropped: bad index
            { index: 2, char: '1', alternatives: [] }, // dropped: no alternatives
          ],
        })
      )
    );
    const result = await recognizeWithGemini(PNG_1PX, null);
    expect(result.uncertain).toEqual([{ index: 0, char: '√', alternatives: ['V', '4'] }]);
  });

  it('rejects HTML fallback responses (Worker not running)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(200, '<html>index</html>'));
    await expect(recognizeWithGemini(PNG_1PX, null)).rejects.toMatchObject({
      code: 'bad_response',
    });
  });
});

describe('solveWithGemini', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the numeric answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { answer: '52.5', source: 'gemini' }))
    );
    expect(await solveWithGemini('what is 15% of 350?')).toEqual({ answer: '52.5' });
  });

  it('propagates UNANSWERABLE as null', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(200, { answer: null, source: 'gemini' }));
    expect(await solveWithGemini('???')).toEqual({ answer: null });
  });

  it('surfaces the simple-arithmetic gate', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(400, { error: 'CLIENT_EVALUABLE' }));
    await expect(solveWithGemini('2+3')).rejects.toMatchObject({ code: 'CLIENT_EVALUABLE' });
  });
});
