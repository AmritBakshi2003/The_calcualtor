import { describe, expect, it } from 'vitest';
import { RateLimiter, isSameOriginRequest, readJsonBody } from '../src/http';
import { apiErrorFrom } from './helpers';

describe('isSameOriginRequest', () => {
  const url = new URL('https://calc.example.com/api/scan/recognize');

  it('allows same-origin POSTs', () => {
    const request = new Request(url, {
      method: 'POST',
      headers: { origin: 'https://calc.example.com' },
    });
    expect(isSameOriginRequest(request, url)).toBe(true);
  });

  it('rejects foreign origins', () => {
    const request = new Request(url, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(isSameOriginRequest(request, url)).toBe(false);
  });

  it('allows requests without an Origin (non-browser clients)', () => {
    expect(isSameOriginRequest(new Request(url, { method: 'POST' }), url)).toBe(true);
  });
});

describe('readJsonBody', () => {
  it('parses a JSON object', async () => {
    const request = new Request('https://x/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"question":"2+3"}',
    });
    expect(await readJsonBody(request)).toEqual({ question: '2+3' });
  });

  it('rejects non-JSON content types and malformed bodies', async () => {
    expect(
      await apiErrorFrom(() =>
        readJsonBody(
          new Request('https://x/api', { method: 'POST', body: 'plain', headers: {} })
        )
      )
    ).toMatchObject({ status: 400 });
    expect(
      await apiErrorFrom(() =>
        readJsonBody(
          new Request('https://x/api', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{nope',
          })
        )
      )
    ).toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });

  it('rejects JSON arrays instead of objects', async () => {
    expect(
      await apiErrorFrom(() =>
        readJsonBody(
          new Request('https://x/api', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '[1,2]',
          })
        )
      )
    ).toMatchObject({ status: 400 });
  });
});

describe('RateLimiter', () => {
  it('allows up to max then blocks until the window passes', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow('ip', 0)).toBe(true);
    expect(limiter.allow('ip', 1)).toBe(true);
    expect(limiter.allow('ip', 2)).toBe(false);
    expect(limiter.allow('ip', 1_001)).toBe(true);
  });

  it('separates clients', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 0)).toBe(false);
  });
});
