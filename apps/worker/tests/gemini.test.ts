import { describe, expect, it, vi } from 'vitest';
import { extractGeminiText, generateContent, GeminiApiError } from '../src/gemini';
import type { FetchLike } from '../src/env';

function GeminiResponse(pairs: Array<{ text?: string }>, status = 200) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: pairs }, finishReason: 'STOP' }] }),
    { status }
  );
}

describe('extractGeminiText', () => {
  it('joins multi-part text', () => {
    expect(extractGeminiText({ candidates: [{ content: { parts: [{ text: '12' }, { text: '+3' }] } }] })).toBe('12+3');
  });

  it('ignores thinking-model thought parts so reasoning never leaks into a result', () => {
    expect(
      extractGeminiText({
        candidates: [
          {
            content: {
              parts: [
                { text: 'let me look at the ink...', thought: true },
                { text: '189+82' },
                { text: 'double-check 189... yes', thought: true },
              ],
            },
          },
        ],
      })
    ).toBe('189+82');
  });

  it('returns empty when there are no candidates', () => {
    expect(extractGeminiText({})).toBe('');
  });
});

describe('generateContent', () => {
  const env = { GEMINI_API_KEY: 'test-key' };

  it('throws gemini_not_configured without a key', async () => {
    await expect(
      generateContent({}, { parts: [], systemInstruction: 'x' })
    ).rejects.toMatchObject({ code: 'gemini_not_configured', status: 503 });
  });

  it('sends the key as a header and returns visible text', async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(String(url)).toContain('gemini-3.8-flash:generateContent');
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      expect(headers.get('x-goog-api-key')).toBe('test-key');
      const payload = JSON.parse(String((init as RequestInit | undefined)?.body));
      expect(payload.systemInstruction.parts[0].text).toBe('x');
      expect(payload.generationConfig.temperature).toBe(0);
      return GeminiResponse([{ text: '12+3' }]);
    };
    await expect(
      generateContent(env, { parts: [{ text: 'q' }], systemInstruction: 'x' }, { fetchImpl })
    ).resolves.toBe('12+3');
  });

  it('maps 429 to rate_limited and 401 to gemini_error (502, no detail leak)', async () => {
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, {
        fetchImpl: async () => new Response('{}', { status: 429 }),
      })
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, {
        fetchImpl: async () => new Response('bad key', { status: 401 }),
      })
    ).rejects.toMatchObject({ code: 'gemini_error', status: 502 });
  });

  it('treats an empty visible body as empty_response', async () => {
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, {
        fetchImpl: async () => GeminiResponse([]),
      })
    ).rejects.toMatchObject({ code: 'empty_response' });
  });

  it('maps transport failures to timeout', async () => {
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, {
        fetchImpl: async () => {
          throw new TypeError('network down');
        },
      })
    ).rejects.toBeInstanceOf(GeminiApiError);
  });

  it('carries the upstream status on gemini_error so 502s diagnose themselves', async () => {
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, {
        fetchImpl: async () => new Response('bad key', { status: 401 }),
      })
    ).rejects.toMatchObject({ code: 'gemini_error', upstreamStatus: 401 });
  });

  it('retries a transient Google-side 500 once and recovers', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? new Response('boom', { status: 500 }) : GeminiResponse([{ text: '12+3' }]);
    };
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, { fetchImpl })
    ).resolves.toBe('12+3');
    expect(calls).toBe(2);
  });

  it('retries a visible-empty thinking response once and recovers', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? GeminiResponse([]) : GeminiResponse([{ text: '99+99/9' }]);
    };
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, { fetchImpl })
    ).resolves.toBe('99+99/9');
    expect(calls).toBe(2);
  });

  it('falls back to the secondary model when the primary 404s, then keeps failing publicly', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(String(url));
      return new Response('not found', { status: 404 });
    };
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' }, { fetchImpl })
    ).rejects.toMatchObject({ upstreamStatus: 404 });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('gemini-3.5-flash-lite');
  });

  it('does not override a user-pinned model on 404', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(String(url));
      return new Response('not found', { status: 404 });
    };
    await expect(
      generateContent({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'custom-model' }, { parts: [], systemInstruction: 'x' }, {
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(GeminiApiError);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('custom-model');
  });

  it('never retries auth failures (a second bad-key call is pure waste)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return new Response('no', { status: 403 });
    }));
    await expect(
      generateContent(env, { parts: [], systemInstruction: 'x' })
    ).rejects.toMatchObject({ upstreamStatus: 403 });
    expect(calls).toBe(1);
  });
});
