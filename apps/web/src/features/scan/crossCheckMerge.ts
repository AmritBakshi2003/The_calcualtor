/**
 * How cross-check results merge with the local engine's reading.
 *
 * Pure function so the merge rules are unit tested without mocks.
 *
 * Rules (from "S1..S3" of the accuracy plan):
 *  1. The local reading is never silently replaced when it is itself valid.
 *  2. When local fails (empty or unparseable), a validated cross-check that
 *     parses becomes the answer — one working fallback beats a blank box.
 *  3. Otherwise the cross-checks are suggestions, shown separately.
 */

export type LocalQuality = 'missing' | 'parses' | 'empty';

export interface CrossCheckOutcome {
  /** What should land in the edit box (local text, remote text, or ''). */
  expression: string;
  /** Where the landed text came from (for the summary line). */
  source: 'local' | 'ocrspace' | 'gemini';
  /** True when a suggestion would display a disagreement note. */
  hasSuggestion: boolean;
}

export interface RemoteRead {
  engine: 'ocrspace' | 'gemini';
  /** Whitespace-stripped arithmetic text or adjudicated expression. */
  text: string;
  /** Executes successfully in the evaluator (checked by the caller). */
  parses: boolean;
  /** Gemini only: self-assessed certainty 0..1 (OCR.space has none). */
  confidence?: number;
}

/**
 * Decide the final text.
 *
 * @param localQuality state of the local reading ('parses' means it evaluates)
 * @param localText the local reading as-is
 * @param remotes cross-check readings that were fetched this scan
 */
export function mergeCrossChecks(
  localQuality: LocalQuality,
  localText: string,
  remotes: RemoteRead[]
): CrossCheckOutcome {
  const usable = remotes.filter((r) => r.parses && r.text.trim());
  if (localQuality === 'parses') {
    // The local reading stands, but a disagreeing validated remote reading is
    // exactly what the cross-check summary is for: flag it as a suggestion.
    const compactLocal = localText.replace(/\s+/g, '');
    const disagrees = usable.some((r) => r.text.replace(/\s+/g, '') !== compactLocal);
    return { expression: localText, source: 'local', hasSuggestion: disagrees };
  }
  if (localQuality === 'missing') {
    // Prefer remote readings in cross-engine order: OCR.space is an actual
    // independent OCR; Gemini adjudicates readings and can hallucinate when
    // the true text differs from every candidate.
    const ocrSpace = usable.find((r) => r.engine === 'ocrspace');
    const gemini = usable.find((r) => r.engine === 'gemini');
    const pick = ocrSpace ?? gemini;
    if (pick) return { expression: pick.text, source: pick.engine, hasSuggestion: false };
  }
  if (localQuality === 'empty') {
    return { expression: '', source: 'local', hasSuggestion: usable.length > 0 };
  }
  return { expression: localText, source: 'local', hasSuggestion: false };
}
