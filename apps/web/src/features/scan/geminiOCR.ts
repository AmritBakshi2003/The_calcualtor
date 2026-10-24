/**
 * Gemini cross-check adjudicator.
 *
 * Different engines read the same photo differently (a classic: "÷" as "+").
 * When the user supplies a Gemini API key (Google AI Studio), the Scan tab can
 * show all candidate readings — local Tesseract passes plus the OCR.space
 * cloud read — to Gemini with a cropped image of the expression, and ask it
 * which candidate is the arithmetic line most likely printed on the image.
 *
 * The output is treated as ADVISORY, never authoritative output of unknown
 * shape: whatever Gemini returns is re-validated locally with the same
 * evaluators + plus/minus shape checks used for app-internal candidates, and
 * anything that fails validation is dropped. Gemini may be used only via its
 * official JSON REST endpoint with the user's own API key; the key is stored
 * in localStorage, never in the bundle, and the request goes browser ->
 * Google directly.
 */

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const ADJUDICATION_TIMEOUT_MS = 15000;

const KEY_STORAGE = 'calc:gemini-key';
const MODEL_STORAGE = 'calc:gemini-model';

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setGeminiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Ignore storage unavailability.
  }
}

export function getGeminiModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

export function setGeminiModel(model: string): void {
  try {
    if (model.trim()) localStorage.setItem(MODEL_STORAGE, model.trim());
    else localStorage.removeItem(MODEL_STORAGE);
  } catch {
    // Ignore storage unavailability.
  }
}

export interface GeminiAdjudication {
  /** Normalized arithmetic expression Gemini chose. */
  expression: string;
  /** 0–1 self-assessed certainty. */
  confidence: number;
  /** Why (a short phrase, shown only in the cross-check summary). */
  reason: string;
}

export interface AdjudicationCandidate {
  engine: string;
  text: string;
}

export interface AdjudicationOptions {
  apiKey: string;
  model?: string;
  /** The preprocessed crop of the expression, best under ~1 MB as JPEG. */
  imageBase64?: string;
  imageMimeType?: string;
}

function buildPrompt(candidates: AdjudicationCandidate[], hasImage: boolean): string {
  const lines = candidates
    .map((c, i) => `${i + 1}. [${c.engine}] ${JSON.stringify(c.text)}`)
    .join('\n');
  return [
    'You review OCR readings of one arithmetic expression (digits and the operators + - * / ^ % x ( ) =).',
    hasImage ? 'A photo of the line is attached.' : 'No image is attached; judge only from the readings.',
    'Candidate readings, in reading order:',
    lines,
    '',
    'Decide what expression the image most likely shows. Rules:',
    '- Keep the digit/operator characters exactly as needed for a valid arithmetic expression.',
    '- Remove any decimal separators that are artifacts, but do not invent missing terms.',
    '- The result must be one single short expression; answer "unknown" only if no candidate could plausibly be the line.',
    'Reply ONLY with JSON: {"expression": string, "confidence": number, "reason": string}. "confidence" is 0..1.',
  ].join('\n');
}

/** Pull JSON out of the model response, tolerating ```json fences. */
export function parseAdjudicationJson(text: string): GeminiAdjudication | null {
  if (!text) return null;
  const unfenced = text.replace(/```(?:json)?/gi, '').trim();
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      expression?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    const expression = typeof parsed.expression === 'string' ? parsed.expression.trim() : '';
    if (!expression || /unknown/i.test(expression)) return null;
    return {
      expression,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    };
  } catch {
    return null;
  }
}

export async function adjudicateExpression(
  candidates: AdjudicationCandidate[],
  options: AdjudicationOptions
): Promise<GeminiAdjudication | null> {
  const { apiKey, model = getGeminiModel(), imageBase64, imageMimeType } = options;
  if (!apiKey.trim() || candidates.length === 0) return null;

  const prompt = buildPrompt(candidates, Boolean(imageBase64));
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageBase64) {
    parts.unshift({ inline_data: { mime_type: imageMimeType ?? 'image/jpeg', data: imageBase64 } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADJUDICATION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return parseAdjudicationJson(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
