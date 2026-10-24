import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OCR_SPACE_ENDPOINT,
  getOcrSpaceKey,
  readEquationOcrSpace,
  sanitizeMathText,
  setOcrSpaceKey,
} from './ocrSpace';

const okResponse = (parsedText: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    IsErroredOnProcessing: false,
    ParsedResults: [{ ParsedText: parsedText }],
  }),
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sanitizeMathText', () => {
  it('strips all whitespace around operators per the guide', () => {
    expect(sanitizeMathText('5 + 4 = 9')).toBe('5+4=9');
    expect(sanitizeMathText('12\n*\n7')).toBe('12*7');
    expect(sanitizeMathText('  (25+7)*4 ')).toBe('(25+7)*4');
  });
});

describe('key storage', () => {
  it('persists and clears the key', () => {
    setOcrSpaceKey('  abc123  ');
    expect(getOcrSpaceKey()).toBe('abc123');
    setOcrSpaceKey('');
    expect(getOcrSpaceKey()).toBe('');
  });
});

describe('readEquationOcrSpace', () => {
  it('calls the documented endpoint with the guide parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('5 + 4 = 9\n'));
    vi.stubGlobal('fetch', fetchMock);

    const read = await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz');

    expect(read).toEqual({ raw: '5 + 4 = 9\n', text: '5+4=9' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OCR_SPACE_ENDPOINT);
    expect((init.headers as Record<string, string>).apikey).toBe('KEY');
    const body = init.body as FormData;
    expect(body.get('base64Image')).toBe('data:image/jpeg;base64,xyz');
    expect(body.get('language')).toBe('eng');
    expect(body.get('scale')).toBe('true');
    expect(body.get('OCREngine')).toBe('2');
    expect(body.get('detectOrientation')).toBe('true');
    expect(body.get('isOverlayRequired')).toBe('false');
    expect(body.get('FileType')).toBe('Auto');
  });

  it('returns null without a key or image (no network call)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await readEquationOcrSpace('', 'data:image/jpeg;base64,xyz')).toBeNull();
    expect(await readEquationOcrSpace('KEY', '')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on engine error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          IsErroredOnProcessing: true,
          ErrorMessage: ['File size limit exceeded'],
        }),
      })
    );
    expect(await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz')).toBeNull();
  });

  it('returns null on empty ParsedResults and on empty text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ParsedResults: [] }) })
    );
    expect(await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse('   \n')
      )
    );
    expect(await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz')).toBeNull();
  });

  it('returns null on HTTP errors and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    expect(await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await readEquationOcrSpace('KEY', 'data:image/jpeg;base64,xyz')).toBeNull();
  });
});
