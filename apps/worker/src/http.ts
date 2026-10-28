/**
 * HTTP plumbing shared by all routes: typed errors, JSON responses and the
 * same-origin guard (the scanner UI is the only intended client).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** JSON responses are private/no-store: each answers one exact request. */
export function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

export function errorResponse(error: ApiError): Response {
  return jsonResponse(error.status, { error: error.code, message: error.message });
}

/**
 * Same-origin enforcement: browsers always attach `Origin` on POST requests.
 * A missing Origin means a non-browser client; it is allowed so command-line
 * checks still work, while any foreign Origin (CSRF vector) is rejected.
 */
export function isSameOriginRequest(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === url.origin;
}

/** Parse a JSON request body; rejects non-JSON/oversized bodies. */
export async function readJsonBody(request: Request): Promise<object> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'content-type must be application/json.');
  }
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
    }
    return parsed as object;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

/**
 * Best-effort per-isolate rate limiter. Worker isolates are ephemeral, so
 * this is a flood guard, not an accounting system: repeated instances of a
 * hot isolate each keep the last `WINDOW` worth of hits per client IP.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const timestamps = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.max) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    // Cheap garbage collection: drop empty entries.
    if (this.hits.size > 5_000) {
      for (const [k, v] of this.hits) {
        if (v.length === 0) this.hits.delete(k);
      }
    }
    return true;
  }

  /** Clear all state (tests, admin resets). */
  reset(): void {
    this.hits.clear();
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}
