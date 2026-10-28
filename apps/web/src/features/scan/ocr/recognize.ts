/**
 * Phase-1 recognition runner: each preprocessing variant (grayscale, Otsu,
 * Sauvola — see ./preprocess.ts) is recognized with PSM 7 (single text line)
 * and PSM 13 (raw line), for at most 6 recognitions per scan.
 *
 * Settings shared by every pass:
 *  - LSTM engine (the worker is created with OEM.LSTM_ONLY in
 *    `useOCRWorker.ts`),
 *  - the scan whitelist (see ./normalize.ts).
 *
 * This step only collects RAW pass results; step 5 (candidates) normalizes,
 * scores and ranks them.
 */
import Tesseract from 'tesseract.js';
import { OCR_DEFAULT_PARAMS } from '../useOCRWorker';
import {
  WHITELIST_CONFIDENCE_FALLBACK,
  expressionScore,
  rankSegments,
  toSegments,
  type OcrSegment,
} from '../ocrScoring';
import { classifyPlusOrDivide } from '../glyphCheck';
import { buildVariants, type OcrVariantName } from './preprocess';
import { normalize, normalizeWithWarnings, SCAN_WHITELIST } from './normalize';

/** PSMs the variants run under: 7 = single text line, 13 = raw line. */
export const SCAN_PSMS = [7, 13] as const;
export type ScanPsm = (typeof SCAN_PSMS)[number];

/** Hard cap; 3 variants × 2 PSMs = exactly 6. */
export const MAX_RECOGNITIONS_PER_SCAN = 6;

const PSM_TO_TESSERACT: Record<ScanPsm, Tesseract.PSM> = {
  7: Tesseract.PSM.SINGLE_LINE,
  13: Tesseract.PSM.RAW_LINE,
};

/** One raw recognition pass over one variant. */
export interface VariantPassResult {
  /** Recognizer output, trimmed. May be junk — cleaning happens in step 5. */
  rawText: string;
  /** Tesseract's confidence, clamped to [0, 100]. 0 under the whitelist. */
  confidence: number;
  variant: OcrVariantName;
  psm: ScanPsm;
  /** Best-ranked line segment, for low-confidence glyph UIs downstream. */
  segment?: OcrSegment;
}

/** The slice of the Tesseract worker the runner needs (eases test doubles). */
export interface RecognizerWorker {
  setParameters(params: Partial<Tesseract.WorkerParams>): Promise<unknown>;
  recognize(image: string): Promise<Tesseract.RecognizeResult>;
}

function clampConfidence(value: unknown): number {
  return Math.max(0, Math.min(100, typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

/**
 * Run every variant × PSM pass. Parameters are set per pass and ALWAYS
 * restored to the worker defaults afterwards (the same discipline
 * ScanCalculator's `performOCR` uses), so one failed pass cannot leave the
 * shared worker stuck in a different mode.
 *
 * Never throws past a single pass: a failing pass is recorded as an empty
 * result so the remaining variants still get their chance.
 */
export async function runVariantPasses(
  canvas: HTMLCanvasElement,
  getWorker: () => Promise<RecognizerWorker>
): Promise<VariantPassResult[]> {
  const variants = buildVariants(canvas);
  if (variants.length === 0) return [];

  const worker = await getWorker();
  const results: VariantPassResult[] = [];

  for (const variant of variants) {
    if (results.length >= MAX_RECOGNITIONS_PER_SCAN) break;
    // PNG (lossless) preserves crisp digit edges; JPEG artifacts degrade OCR.
    const image = variant.canvas.toDataURL('image/png');

    for (const psm of SCAN_PSMS) {
      if (results.length >= MAX_RECOGNITIONS_PER_SCAN) break;

      let rawText = '';
      let confidence = 0;
      let segment: OcrSegment | undefined;
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM_TO_TESSERACT[psm],
          tessedit_char_whitelist: SCAN_WHITELIST,
        });
        const result = await worker.recognize(image);
        rawText = (result.data.text ?? '').trim();
        confidence = clampConfidence(result.data.confidence);
        segment = rankSegments(toSegments(result))[0];
      } catch {
        // Record the failure and keep going; candidates judge the rest.
      } finally {
        try {
          await worker.setParameters(OCR_DEFAULT_PARAMS);
        } catch {
          // Nothing more to do; the next pass sets what it needs.
        }
      }

      results.push({
        rawText: correctDivideMisreads(rawText, variant.canvas, segment),
        confidence,
        variant: variant.name,
        psm,
        segment,
      });
    }
  }

  return results;
}

/**
 * Tesseract reads "÷" as "+" on phone photos, and the wrong operator
 * silently evaluates "144÷12" as 156 instead of 12. Port of the scanner's
 * glyph re-check (ScanCalculator.refinePlusOrDivide), now applied per pass
 * at the RAW text level: the pass's symbol boxes are relative to ITS OWN
 * variant canvas, so cropping that canvas is geometrically valid — which the
 * old single-canvas version could not guarantee across scaled variants.
 *
 * Only applied when every "+" symbol maps 1:1 onto a "+" in the raw text, so
 * a partial match cannot corrupt it; a correction that fails to normalize is
 * discarded (the uncorrected reading stands).
 */
function correctDivideMisreads(raw: string, canvas: HTMLCanvasElement, segment?: OcrSegment): string {
  if (!segment?.symbols) return raw;
  const plusSymbols = segment.symbols.filter((symbol) => symbol.text === '+');
  const plusChars = (raw.match(/\+/g) ?? []).length;
  if (plusSymbols.length === 0 || plusSymbols.length !== plusChars) return raw;
  if (plusSymbols.some((symbol) => !symbol.bbox)) return raw;

  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;

  let corrected = raw;
  let changed = false;
  let plusIndex = 0;
  for (const symbol of plusSymbols) {
    const bbox = symbol.bbox!;
    const padX = Math.round((bbox.x1 - bbox.x0) * 0.15);
    const padY = Math.round((bbox.y1 - bbox.y0) * 0.15);
    const x = Math.max(0, bbox.x0 - padX);
    const y = Math.max(0, bbox.y0 - padY);
    const width = Math.max(1, Math.min(canvas.width - x, bbox.x1 - bbox.x0 + 1 + padX * 2));
    const height = Math.max(1, Math.min(canvas.height - y, bbox.y1 - bbox.y0 + 1 + padY * 2));

    let gray: ImageData;
    try {
      gray = ctx.getImageData(x, y, width, height);
    } catch {
      // Cross-origin canvases throw; keep the uncorrected reading.
      return raw;
    }
    if (classifyPlusOrDivide(gray) !== 'divide') {
      plusIndex++;
      continue;
    }

    // Replace the plusIndex-th "+" char with "÷" (normalized division).
    let seen = -1;
    corrected = corrected.replace(/\+/g, () => {
      seen++;
      return seen === plusIndex ? '÷' : '+';
    });
    changed = true;
    plusIndex++;
  }

  if (!changed) return raw;
  // A "÷" misread as a broken plus could turn into an expression that no
  // longer parses; keep whichever reading survived normalization.
  return normalize(corrected) !== null ? corrected : raw;
}

/**
 * A Phase-1 candidate: one cleaned reading of one variant under one PSM.
 */
export interface ScanCandidate {
  /** Cleaned expression (the ×/÷ display alphabet), '' when normalize failed. */
  expression: string;
  /** The raw pre-cleaning pass output (the cross-check hint sent to Gemini). */
  rawText: string;
  /** Pass confidence; a whitelist pass's 0 is replaced by the fallback value. */
  confidence: number;
  /** False when the pass's confidence is the whitelist reporting quirk (0). */
  confidenceKnown: boolean;
  variant: OcrVariantName;
  psm: ScanPsm;
  /** Ranking score (see expressionScore); -Infinity when nothing parsed. */
  score: number;
  /** Best-ranked line segment, for the low-confidence glyph UI. */
  segment?: OcrSegment;
  /** Ambiguous characters this pass auto-corrected, e.g. ["O→0"]. */
  substitutions: string[];
  /**
   * Characters normalize() had to DROP from this reading because the scan
   * alphabet does not name them ("2+3¤5" dropped ["¤"]). Dropping can
   * change the value, so any non-empty list must show a warning and keep
   * the reading unverified. Empty when the reading cleaned losslessly.
   */
  dropped: string[];
}

/**
 * Rank candidates best-first. Ties keep collection order (variant, then PSM)
 * because Array#sort is stable, so identical scores stay predictable.
 */
export function rankScanCandidates(candidates: ScanCandidate[]): ScanCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}

/**
 * Turn the raw variant passes into ranked candidates: normalize each reading,
 * score it (whitelist confidence 0 is a reporting quirk, so it is scored as
 * WHITELIST_CONFIDENCE_FALLBACK while `confidenceKnown` stays false), and
 * sort best-first. The caller picks the winner and decides what empty
 * results mean (engine reload + retry).
 */
export async function recognizeScanCandidates(
  canvas: HTMLCanvasElement,
  getWorker: () => Promise<RecognizerWorker>
): Promise<ScanCandidate[]> {
  const passes = await runVariantPasses(canvas, getWorker);

  const candidates: ScanCandidate[] = passes.map((pass) => {
    const reads = pass.confidence > 0;
    const confidence = reads ? pass.confidence : WHITELIST_CONFIDENCE_FALLBACK;
    const cleaned = normalizeWithWarnings(pass.rawText);
    const expression = cleaned.expression ?? '';
    return {
      expression,
      rawText: pass.rawText,
      confidence,
      confidenceKnown: reads,
      variant: pass.variant,
      psm: pass.psm,
      score: expressionScore(expression, confidence, pass.rawText),
      segment: pass.segment,
      // The whitelist-only pipeline cannot substitute look-alike letters:
      // characters outside the scan alphabet are DROPPED by normalize, never
      // swapped ("2O5" -> "25"), so there is no honest "O→0" correction to
      // report and the ambiguity warning cannot trigger.
      substitutions: [],
      // Lost symbols travel with the reading so the UI can warn ("2+3¤5"
      // became "2+35") instead of letting a silently-cleaned value win.
      dropped: expression ? cleaned.dropped : [],
    };
  });

  return rankScanCandidates(candidates);
}
