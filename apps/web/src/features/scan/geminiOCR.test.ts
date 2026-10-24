import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_ENDPOINT,
  getGeminiKey,
  getGeminiModel,
  parseAdjudicationJson,
  setGeminiKey,
  setGeminiModel,
} from './geminiOCR';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('key/model storage', () => {
  it('persists and clears key and model, defaulting the model', () => {
    setGeminiKey(' key-1 ');
    expect(getGeminiKey()).toBe('key-1');
    setGeminiKey('');
    expect(getGeminiKey()).toBe('');

    expect(getGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);
    setGeminiModel('gemini-2.5-flash');
    expect(getGeminiModel()).toBe('gemini-2.5-flash');
    setGeminiModel('');
    expect(getGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);
  });
});

describe('parseAdjudicationJson', () => {
  it('parses plain JSON responses', () => {
    expect(
      parseAdjudicationJson('{"expression":"12+34","confidence":0.9,"reason":"clearest"}')
    ).toEqual({ expression: '12+34', confidence: 0.9, reason: 'clearest' });
  });

  it('parses fenced responses and tags', () => {
    const fenced = '```json\n{"expression":"12+34","confidence":0.8,"reason":"r"}\n```';
    expect(parseAdjudicationJson(fenced)?.expression).toBe('12+34');
    expect(
      parseAdjudicationJson('Sure. {"expression":"144/12","confidence":0.7,"reason":"bar visible"}')?.confidence
    ).toBeCloseTo(0.7);
  });

  it('clamps confidence into 0..1', () => {
    const bad = parseAdjudicationJson('{"expression":"1+2","confidence":5,"reason":"r"}');
    expect(bad?.confidence).toBe(1);
    const worse = parseAdjudicationJson('{"expression":"1+2","confidence":-3,"reason":"r"}');
    expect(worse?.confidence).toBe(0);
  });

  it('rejects unknown answers and malformed payloads', () => {
    expect(parseAdjudicationJson('{"expression":"unknown","confidence":0.9,"reason":"blurry"}')).toBeNull();
    expect(parseAdjudicationJson('{"expression":"  ","confidence":0.9}')).toBeNull();
    expect(parseAdjudicationJson('not json')).toBeNull();
    expect(parseAdjudicationJson('')).toBeNull();
  });
});

describe('adjudicateExpression', () => {
  const validCandidates = [{ engine: 'tesseract', text: '12+34' }];

  it('no-ops without a key or candidates', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { adjudicateExpression } = await import('./geminiOCR');
    expect(await adjudicateExpression(validCandidates, { apiKey: '' })).toBeNull();
    expect(await adjudicateExpression([], { apiKey: 'KEY' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the generateContent endpoint with the prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"expression":"144/12","confidence":0.85,"reason":"bar+dots"}' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { adjudicateExpression } = await import('./geminiOCR');

    const result = await adjudicateExpression(
      [{ engine: 'tesseract', text: '144+12' }, { engine: 'ocrspace', text: '144/12' }],
      { apiKey: 'KEY', model: 'gemini-2.0-flash', imageBase64: 'QQ==', imageMimeType: 'image/jpeg' }
    );

    expect(result?.expression).toBe('144/12');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`${GEMINI_ENDPOINT}/gemini-2.0-flash:generateContent?key=KEY`);
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.contents[0].parts[0].inline_data.data).toBe('QQ==');
    const prompt = body.contents[0].parts.at(-1)?.text as string;
    expect(prompt).toContain('[tesseract] "144+12"');
    expect(prompt).toContain('[ocrspace] "144/12"');
    expect(prompt).toContain('A photo of the line is attached');
  });

  it('returns null on HTTP errors and on unparsable model output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { adjudicateExpression } = await import('./geminiOCR');
    expect(await adjudicateExpression(validCandidates, { apiKey: 'KEY' })).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'plain prose' }] } }] }),
      })
    );
    expect(await adjudicateExpression(validCandidates, { apiKey: 'KEY' })).toBeNull();
  });
});
