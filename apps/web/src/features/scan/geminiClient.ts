/**
 * Browser client for the same-origin Gemini scan API (apps/worker).
 *
 * The Gemini key never lives in the browser: recognition and complex solving
 * are POSTs to same-origin /api routes served by the Worker. Every failure
 * degrades gracefully — the scanner keeps working with pure local OCR.
 *
 * Vite dev/preview servers answer unknown paths (like /api/* when the Worker
 * is not running) with index.html; every response is therefore validated for
 * shape, not just status, so a HTML fallback can never impersonate the API.
 */

export interface ScanCapabilities {
  gemini: boolean;
}

export interface GeminiRecognition {
  /** '' when the model reports the image unreadable. */
  expression: string;
  unreadable: boolean;
  /** True only when a second server-side pass confirmed the reading against the ink. */
  verified: boolean;
  /**
   * Characters the model flagged in its step-5 JSON answer: its index in
   * `expression`, the char as read, and plausible alternatives. Only present
   * when the model reported doubt; validated here before use.
   */
  uncertain?: UncertainChar[];
}

/** One uncertain character from the worker's recognize response. */
export interface UncertainChar {
  index: number;
  char: string;
  alternatives: string[];
}

/**
 * Validate the worker's `uncertain` array (the model is never trusted with
 * the shape): integer index >= 0, non-empty char, non-empty alternatives.
 */
function parseUncertain(value: unknown): UncertainChar[] {
  if (!Array.isArray(value)) return [];
  const entries: UncertainChar[] = [];
  for (const raw of value) {
    if (entries.length >= 12) break;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    if (typeof record.index !== 'number' || !Number.isInteger(record.index) || record.index < 0) {
      continue;
    }
    if (typeof record.char !== 'string' || record.char.length === 0) continue;
    const alternatives = Array.isArray(record.alternatives)
      ? record.alternatives
          .filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
          .slice(0, 5)
      : [];
    if (alternatives.length === 0) continue;
    entries.push({ index: record.index, char: record.char, alternatives });
  }
  return entries;
}

export class GeminiUnavailableError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Capabilities change only on deploy; a short cache avoids a probe per scan. */
const CAPABILITIES_TTL_MS = 10 * 60 * 1000;
let capabilitiesCache: { value: ScanCapabilities; fetchedAt: number } | null = null;

export function resetCapabilitiesCache(): void {
  capabilitiesCache = null;
}

const MAX_GEMINI_IMAGE_SIDE = 2000;

/** Target dimensions that keep the payload small without losing stroke detail. */
export function downscaleDimensions(
  width: number,
  height: number,
  maxSide = MAX_GEMINI_IMAGE_SIDE
): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxSide || longSide === 0) return { width, height };
  const scale = maxSide / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** How long to wait for an <img> decode before uploading the original bytes. */
const IMAGE_LOAD_TIMEOUT_MS = 2000;

/** Shrink a data-URL image for upload; returns the input when already small. */
export async function downscaleImageDataUrl(dataUrl: string, maxSide = MAX_GEMINI_IMAGE_SIDE): Promise<string> {
  const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => {
      // Test engines (jsdom) never decode images; do not hang on them.
      image.src = '';
      resolve(null);
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = dataUrl;
  });
  if (!dimensions) return dataUrl;
  const target = downscaleDimensions(dimensions.width, dimensions.height, maxSide);
  if (target.width === dimensions.width && target.height === dimensions.height) {
    return dataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load the image for upload.'));
    image.src = dataUrl;
  });
  context.drawImage(image, 0, 0, target.width, target.height);
  return canvas.toDataURL('image/png');
}

function splitDataUrl(dataUrl: string): { image: string; mime: string } {
  const match = /^data:([^;,]+(?:;charset=[^;,]+)*)[;,]base64,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new GeminiUnavailableError('invalid_image', 0, 'Image could not be prepared for upload.');
  }
  return { mime: match[1], image: match[2] };
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Interrogate a failed response into a typed, user-actionable error. */
async function requireApiOk(response: Response, action: string): Promise<object> {
  if (response.ok) {
    try {
      return (await response.json()) as object;
    } catch {
      throw new GeminiUnavailableError('bad_response', response.status, `${action} is unavailable.`);
    }
  }
  let code = 'server_error';
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.error === 'string') code = payload.error;
  } catch {
    // HTML error pages (dev server without the Worker) fall through here.
  }
  const messages: Record<number, string> = {
    400: 'The question is too long or malformed for Gemini.',
    413: 'The image is too large for Gemini; crop closer to the expression.',
    429: 'Gemini is rate limited — try again in a moment.',
    502: 'Gemini could not process the request.',
    503: 'Gemini is not configured on the server. Recognition stays local.',
    504: 'Gemini did not answer in time.',
  };
  throw new GeminiUnavailableError(
    code,
    response.status,
    messages[response.status] ?? `${action} is unavailable.`
  );
}

export async function fetchGeminiCapabilities(): Promise<ScanCapabilities> {
  const now = Date.now();
  if (capabilitiesCache && now - capabilitiesCache.fetchedAt < CAPABILITIES_TTL_MS) {
    return capabilitiesCache.value;
  }
  let value: ScanCapabilities;
  try {
    const response = await fetch('/api/scan/capabilities', { headers: { accept: 'application/json' } });
    const payload = (await response.json()) as Record<string, unknown>;
    value = { gemini: payload.gemini === true };
  } catch {
    // Offline or no Worker: stay in local-only mode.
    value = { gemini: false };
  }
  capabilitiesCache = { value, fetchedAt: now };
  return value;
}

/** Cross-validate the local OCR reading with the Gemini vision layer. */
export async function recognizeWithGemini(
  dataUrl: string,
  hint: string | null,
  enhancedDataUrl?: string | null
): Promise<GeminiRecognition> {
  const prepared = await downscaleImageDataUrl(dataUrl);
  const { image, mime } = splitDataUrl(prepared);
  // The enhanced crop (grayscale, contrast-normalized) travels as a second
  // image when the caller prepared one; the server treats it as optional.
  let enhanced: string | null = null;
  if (enhancedDataUrl) {
    try {
      enhanced = splitDataUrl(await downscaleImageDataUrl(enhancedDataUrl)).image;
    } catch {
      enhanced = null; // a bad crop must not block the primary path
    }
  }
  const response = await postJson('/api/scan/recognize', { image, mime, hint, enhanced });
  const payload = (await requireApiOk(response, 'Gemini recognition')) as Record<string, unknown>;

  const expression = typeof payload.expression === 'string' ? payload.expression : '';
  const unreadable = payload.unreadable === true;
  if (!expression && !unreadable) {
    throw new GeminiUnavailableError('bad_response', response.status, 'Gemini returned no expression.');
  }
  const uncertain = parseUncertain(payload.uncertain);
  // The live scan flow (Tesseract -> OCR.space -> consensus) does not call
  // this route yet, so there is nothing to render `uncertain` in — keep it
  // visible in devtools instead of dropping the model's own doubt report.
  if (uncertain.length > 0) {
    console.debug('[scan] Gemini flagged uncertain characters:', uncertain);
  }
  return {
    expression,
    unreadable,
    verified: payload.verified === true,
    ...(uncertain.length > 0 ? { uncertain } : {}),
  };
}

/** Solve a question the local engines declined; null answer = undecidable. */
export async function solveWithGemini(question: string): Promise<{ answer: string | null }> {
  const response = await postJson('/api/solve/complex', { question });
  const payload = (await requireApiOk(response, 'Gemini solving')) as Record<string, unknown>;
  if (payload.answer === null) return { answer: null };
  if (typeof payload.answer !== 'string') {
    throw new GeminiUnavailableError('bad_response', response.status, 'Gemini returned no answer.');
  }
  return { answer: payload.answer };
}
