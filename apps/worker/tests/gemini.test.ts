import { describe, expect, it } from 'vitest';
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
});
