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
import { rankSegments, toSegments, type OcrSegment } from '../ocrScoring';
import { buildVariants, type OcrVariantName } from './preprocess';
import { SCAN_WHITELIST } from './normalize';

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

      results.push({ rawText, confidence, variant: variant.name, psm, segment });
    }
  }

  return results;
}
