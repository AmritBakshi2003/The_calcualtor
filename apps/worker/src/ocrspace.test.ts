import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { WorkerEnv } from './env';
import { bytesToBase64, extractOcrSpaceText, parseOcrSpaceImage } from './ocrspace';

const ROOT = 'https://calc.example.com';
const env = { OCR_SPACE_API_KEY: 'test-secret-key' } as WorkerEnv;
const envNoKey = {} as WorkerEnv;

// A 1x1 PNG (valid base64, well under the 1 MB cap).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function ocrSpaceBody(text: string): Response {
  return new Response(JSON.stringify({ ParsedResults: [{ ParsedText: text }], OCRExitCode: 1 }), {
    status: 200,
  });
}

function jsonPost(body: unknown, envUsed: WorkerEnv = env): Promise<Response> {
  return worker.fetch(
    new Request(`${ROOT}/api/scan/ocrspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    envUsed
  );
}

/** A fetch stub whose body/init stay inspectable. */
function makeFetchMock() {
  return vi.fn(async (_input: unknown, _init?: unknown): Promise<Response> => ocrSpaceBody(''));
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('extractOcrSpaceText', () => {
  it('joins ParsedResults text and tolerates missing fields', () => {
    expect(extractOcrSpaceText({ ParsedResults: [{ ParsedText: '2+3' }] })).toBe('2+3');
    expect(extractOcrSpaceText({ ParsedResults: [{ ParsedText: '2' }, {}] })).toBe('2');
    expect(extractOcrSpaceText({})).toBe('');
    expect(extractOcrSpaceText(null)).toBe('');
  });
});

describe('parseOcrSpaceImage', () => {
  it('accepts bare base64 JSON and defaults the mime to PNG', async () => {
    const image = await parseOcrSpaceImage(
      new Request('https://calc.example.com/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: PNG_BASE64 }),
      })
    );
    expect(image).toEqual({ base64: PNG_BASE64, mime: 'image/png' });
  });

  it('accepts a data URI and takes its mime', async () => {
    const image = await parseOcrSpaceImage(
      new Request('https://calc.example.com/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${PNG_BASE64}` }),
      })
    );
    expect(image).toEqual({ base64: PNG_BASE64, mime: 'image/jpeg' });
  });

  it('accepts a multipart file part', async () => {
    const form = new FormData();
    form.set('image', new File([new Uint8Array([0x89, 0x50])], 'scan.png', { type: 'image/png' }));
    const image = await parseOcrSpaceImage(
      new Request('https://calc.example.com/x', { method: 'POST', body: form })
    );
    expect(image.mime).toBe('image/png');
    expect(image.base64).toBe(bytesToBase64(new Uint8Array([0x89, 0x50])));
  });

  it('rejects images over the 1 MB decoded cap with 413', async () => {
    // ~1.5 MB decoded, legal base64 charset.
    const oversized = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 16)}`;
    await expect(
      parseOcrSpaceImage(
        new Request('https://calc.example.com/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: oversized }),
        })
      )
    ).rejects.toMatchObject({ status: 413 });
  });

  it('rejects zero-byte images and disallowed mimes with 400', async () => {
    await expect(
      parseOcrSpaceImage(
        new Request('https://calc.example.com/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: '' }),
        })
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      parseOcrSpaceImage(
        new Request('https://calc.example.com/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: PNG_BASE64, mime: 'image/gif' }),
        })
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects non-base64 and wrong content types with 400', async () => {
    await expect(
      parseOcrSpaceImage(
        new Request('https://calc.example.com/x', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: '!!!notbase64!!!' }),
        })
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      parseOcrSpaceImage(
        new Request('https://calc.example.com/x', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'x',
        })
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('bytesToBase64', () => {
  it('encodes 1-, 2- and 3-byte inputs correctly (padding paths)', () => {
    const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s));
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
  });
});

describe('POST /api/scan/ocrspace', () => {
  it('returns the normalized expression on a successful engine-2 read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ocrSpaceBody('12+34')));

    const response = await jsonPost({ image: PNG_BASE64 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      expression: '12+34',
      rawText: '12+34',
      engine: 2,
    });
  });

  it('normalizes OCR.space output with the shared normalize()', async () => {
    // "2 x 3" -> "2×3"; a junk line and a clock line lose against the
    // longest surviving expression.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ocrSpaceBody('RECEIPT\n9:41\n2 x 3'))
    );

    const response = await jsonPost({ image: PNG_BASE64 });
    expect(await response.json()).toEqual({
      available: true,
      expression: '9÷41',
      rawText: 'RECEIPT\n9:41\n2 x 3',
      engine: 2,
    });
  });

  it('retries once with engine 1 when engine 2 reads nothing', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(ocrSpaceBody('')); // engine 2: no text
    fetchMock.mockResolvedValueOnce(ocrSpaceBody('144÷12')); // engine 1: the read
    vi.stubGlobal('fetch', fetchMock);

    const response = await jsonPost({ image: PNG_BASE64 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      expression: '144÷12',
      rawText: '144÷12',
      engine: 1,
    });

    // Exactly two upstream calls, engine 2 first, with the required params.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstForm = first.body as FormData;
    expect(firstForm.get('OCREngine')).toBe('2');
    expect(firstForm.get('scale')).toBe('true');
    expect(firstForm.get('language')).toBe('eng');
    expect(firstForm.get('detectOrientation')).toBe('true');
    expect(firstForm.get('isOverlayRequired')).toBe('false');
    const retryForm = (fetchMock.mock.calls[1]?.[1] as RequestInit).body as FormData;
    expect(retryForm.get('OCREngine')).toBe('1');
    // The key travels in the apikey request header, never in the body.
    expect((first.headers as Record<string, string>).apikey).toBe('test-secret-key');
    expect(retryForm.get('apikey')).toBeNull();
    expect(String(retryForm.get('base64Image'))).not.toContain('test-secret-key');
  });

  it('does not call engine 1 when engine 2 already read text', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(ocrSpaceBody('2+2'));
    vi.stubGlobal('fetch', fetchMock);

    await jsonPost({ image: PNG_BASE64 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the upstream call after the 10s timeout', async () => {
    vi.useFakeTimers();
    // Hangs until the AbortController fires; then rejects like fetch does.
    const hangFetch = vi.fn(
      (_input: unknown, init?: { signal?: AbortSignal }): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          );
        })
    );
    vi.stubGlobal('fetch', hangFetch);

    const pending = jsonPost({ image: PNG_BASE64 });
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: 'timeout' });
    // A timeout is an error, not "no text": the single engine-1 retry is
    // reserved for an engine-2 read that succeeds but finds nothing.
    expect(hangFetch).toHaveBeenCalledTimes(1);
  });

  it('maps upstream failures to soft reasons with HTTP 200', async () => {
    const cases: [string, () => Promise<Response>, object][] = [
      ['403 (bad key)', async () => new Response('nope', { status: 403 }), { available: false, reason: 'ocrspace_unavailable' }],
      ['429 (quota)', async () => new Response('limit', { status: 429 }), { available: false, reason: 'ocrspace_unavailable' }],
      ['500', async () => new Response('boom', { status: 500 }), { available: false, reason: 'ocrspace_unavailable' }],
      [
        'HTTP 200 with malformed JSON',
        async () => new Response('not json {', { status: 200 }),
        { available: false, reason: 'ocrspace_malformed_response' },
      ],
      [
        'HTTP 200 with IsErroredOnProcessing',
        async () => new Response(JSON.stringify({ IsErroredOnProcessing: true }), { status: 200 }),
        { available: false, reason: 'ocrspace_unavailable' },
      ],
      [
        'plain network failure',
        async () => {
          throw new Error('ECONNRESET');
        },
        { available: false, reason: 'timeout' },
      ],
    ];

    for (const [label, fetchImpl, expected] of cases) {
      const fetchMock = makeFetchMock();
      fetchMock.mockImplementation(fetchImpl as () => Promise<Response>);
      vi.stubGlobal('fetch', fetchMock);

      const response = await jsonPost({ image: PNG_BASE64 });
      expect(response.status, label).toBe(200);
      expect(await response.json(), label).toEqual(expected);
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
  });

  it('does not retry engine 1 after an HTTP failure', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await jsonPost({ image: PNG_BASE64 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports not_configured without a key, without touching the network', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const response = await jsonPost({ image: PNG_BASE64 }, envNoKey);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input with 400/413 like every other route', async () => {
    expect((await jsonPost({ image: '!!!notbase64!!!' })).status).toBe(400);
    expect((await jsonPost({ mime: 'image/png' })).status).toBe(400);
    expect((await jsonPost({ image: `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 16)}` })).status).toBe(413);
    const wrongType = await worker.fetch(
      new Request(`${ROOT}/api/scan/ocrspace`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'x',
      }),
      env
    );
    expect(wrongType.status).toBe(400);
  });

  it('keeps the same-origin guard and 404s other methods', async () => {
    const foreign = await worker.fetch(
      new Request(`${ROOT}/api/scan/ocrspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
        body: JSON.stringify({ image: PNG_BASE64 }),
      }),
      env
    );
    expect(foreign.status).toBe(403);

    const get = await worker.fetch(new Request(`${ROOT}/api/scan/ocrspace`), env);
    expect(get.status).toBe(404);
  });

  it('never leaks the API key in any response or log line', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await jsonPost({ image: PNG_BASE64 });
    const text = await response.text();
    expect(text).not.toContain('test-secret-key');
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('test-secret-key'));
    consoleError.mockRestore();
  });
});
