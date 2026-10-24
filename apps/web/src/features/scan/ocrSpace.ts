/**
 * OCR.space cross-check reader.
 *
 * The local engine (Tesseract) is primary. When the user adds an OCR.space API
 * key, every scan also asks the cloud engine for a second reading of the same
 * image so disagreements are visible (and the cloud read can rescue scans the
 * local engine fails on).
 *
 * Parameters follow the "End-to-End Basic Math OCR Implementation Guide":
 *  - OCREngine 2 is optimized for single-line numeric structures;
 *  - scale=true up-samples thin strokes / low-res calculator screens;
 *  - detectOrientation=true keeps phone-camera rotations from garbling digits;
 *  - white space around operators is stripped from the returned text
 *    ("5 + 4 = 9" -> "5+4=9") so the result evaluates reliably.
 *
 * The key is user-supplied and lives in localStorage only — it never ships in
 * the bundle (OCR.space is called directly from the browser, which its CORS
 * policy allows).
 */

export const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';

/** Free tiers respond slowly on large images — hard cap before we give up. */
const REQUEST_TIMEOUT_MS = 20000;

const KEY_STORAGE = 'calc:ocrspace-key';

export function getOcrSpaceKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setOcrSpaceKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage may be unavailable inside private-mode sandboxes; ignore.
  }
}

/** " 5 + 4 = 9 " / "5\n+\n4" -> "5+4=9" (the guide's String Sanitization step). */
export function sanitizeMathText(raw: string): string {
  return raw.replace(/\s+/g, '');
}

/** AD(Automatic Data Correction)? No: we show it raw, we clean, we do not guess. */
export interface OcrSpaceRead {
  /** Raw ParsedText as returned (already quoting the engine's own spaces). */
  raw: string;
  /** Whitespace-stripped, arithmetic-ready text. */
  text: string;
}

/**
 * Read one equation image through OCR.space. Resolves to null on engine
 * errors, empty reads and network problems — null participates cleanly in the
 * candidate-merging logic upstream.
 */
export async function readEquationOcrSpace(
  apiKey: string,
  imageDataUrl: string
): Promise<OcrSpaceRead | null> {
  if (!apiKey.trim() || !imageDataUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const formData = new FormData();
    formData.append('base64Image', imageDataUrl);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('FileType', 'Auto');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    const response = await fetch(OCR_SPACE_ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey.trim() },
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: Array<{ ParsedText?: string }>;
    };

    if (data.IsErroredOnProcessing || !data.ParsedResults?.length) return null;

    const raw = data.ParsedResults[0].ParsedText ?? '';
    if (!raw.trim()) return null;

    return { raw, text: sanitizeMathText(raw) };
  } catch {
    // Abort_error (timeout), network failure, or a non-JSON body: all "the
    // cross-check is unavailable this time", not scan-terminating errors.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
