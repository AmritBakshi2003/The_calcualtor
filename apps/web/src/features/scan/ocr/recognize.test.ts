import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_RECOGNITIONS_PER_SCAN,
  recognizeScanCandidates,
  rankScanCandidates,
  type ScanCandidate,
} from './recognize';
import { SCAN_WHITELIST } from './normalize';
import { OCR_DEFAULT_PARAMS } from '../useOCRWorker';

vi.mock('tesseract.js', () => ({
  default: { PSM: { SINGLE_LINE: '7', RAW_LINE: '13' } },
}));

// The candidate runner builds its canvases in the browser; jsdom has no
// canvas, so hand it three stand-in variant canvases in the real order.
vi.mock('./preprocess', () => ({
  buildVariants: () =>
    (['grayscale', 'otsu', 'sauvola'] as const).map((name) => ({
      name,
      canvas: {
        width: 10,
        height: 10,
        toDataURL: () => 'data:image/png;base64,AAAA',
        getContext: () => null,
      },
    })),
}));

const ocrText = (text: string, confidence = 90) => ({ data: { text, confidence, lines: [] } });

const makeWorker = () => ({
  setParameters: vi.fn().mockResolvedValue(undefined),
  recognize: vi.fn(),
});

/** Fake recognizer that answers a scripted reading for each pass. */
function scriptRecognitions(worker: ReturnType<typeof makeWorker>, readings: string[]): void {
  let call = 0;
  worker.recognize.mockImplementation(() => {
    const reading = readings[call] ?? readings[readings.length - 1];
    call++;
    return Promise.resolve(ocrText(reading));
  });
}

describe('recognizeScanCandidates', () => {
  let worker: ReturnType<typeof makeWorker>;

  beforeEach(() => {
    worker = makeWorker();
  });

  it('runs exactly 6 recognitions: 3 variants × PSM 7 and PSM 13', async () => {
    scriptRecognitions(worker, ['2+3']);

    const candidates = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(worker.recognize).toHaveBeenCalledTimes(MAX_RECOGNITIONS_PER_SCAN);
    expect(candidates).toHaveLength(MAX_RECOGNITIONS_PER_SCAN);
    expect(candidates.map((c) => `${c.variant}-psm${c.psm}`)).toEqual([
      'grayscale-psm7',
      'grayscale-psm13',
      'otsu-psm7',
      'otsu-psm13',
      'sauvola-psm7',
      'sauvola-psm13',
    ]);
  });

  it('sets the scan whitelist and the pass PSM for every recognition', async () => {
    scriptRecognitions(worker, ['2+3']);

    await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    // Overrides: exactly one per pass, always whitelist + the pass's PSM.
    const overrides = worker.setParameters.mock.calls
      .map(([params]) => params as Record<string, string>)
      .filter((params) => !('user_defined_dpi' in params));
    expect(overrides).toHaveLength(MAX_RECOGNITIONS_PER_SCAN);
    expect(overrides.map((p) => p.tessedit_pageseg_mode)).toEqual(['7', '13', '7', '13', '7', '13']);
    expect(overrides.every((p) => p.tessedit_char_whitelist === SCAN_WHITELIST)).toBe(true);

    // After each pass the worker is returned to its defaults.
    expect(worker.setParameters.mock.calls.at(-1)?.[0]).toEqual(OCR_DEFAULT_PARAMS);
  });

  it('ranks the structurally stronger reading first', async () => {
    // grayscale passes read only a digit run; the Otsu variant reads the
    // real expression with an operator. Scores must put the operator
    // reading on top even though every pass reports the same confidence.
    scriptRecognitions(worker, ['23', '23', '2+3', '2+3', '2+3', '2+3']);

    const ranked = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(ranked[0].expression).toBe('2+3');
    expect(ranked[0].variant).toBe('otsu');
    expect(ranked[0].psm).toBe(7);
    // the weaker digit-run readings sink to the end, in collection order
    expect(ranked[ranked.length - 1].expression).toBe('23');
    expect(ranked[ranked.length - 1].variant).toBe('grayscale');
  });

  it('keeps collection order (variant, then PSM) when scores tie', async () => {
    scriptRecognitions(worker, ['2+3']);

    const ranked = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(ranked.map((c) => `${c.variant}-psm${c.psm}`)).toEqual([
      'grayscale-psm7',
      'grayscale-psm13',
      'otsu-psm7',
      'otsu-psm13',
      'sauvola-psm7',
      'sauvola-psm13',
    ]);
  });

  it('sinks readings normalize() rejects to the end of the list', async () => {
    // "2++3" has two operators in a row -> expression '' -> score -Infinity.
    scriptRecognitions(worker, ['2++3', '2+3', '2+3', '2+3', '2+3', '2+3']);

    const ranked = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(ranked[0].expression).toBe('2+3');
    const last = ranked[ranked.length - 1];
    expect(last.expression).toBe('');
    expect(last.rawText).toBe('2++3');
    expect(Number.isFinite(last.score)).toBe(false);
  });

  it('treats a whitelist confidence of 0 as unknown (fallback, not shown as weak)', async () => {
    scriptRecognitions(worker, ['2+3']);
    worker.recognize.mockResolvedValue(ocrText('2+3', 0));

    const [best] = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(best.confidenceKnown).toBe(false);
    expect(best.confidence).toBeGreaterThan(0); // WHITELIST_CONFIDENCE_FALLBACK
  });

  it('keeps a real confidence as-is', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3', 87));

    const [best] = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(best.confidenceKnown).toBe(true);
    expect(best.confidence).toBe(87);
  });

  it('still returns 6 candidates when every pass throws', async () => {
    worker.recognize.mockRejectedValue(new Error('engine exploded'));

    const ranked = await recognizeScanCandidates({} as HTMLCanvasElement, async () => worker);

    expect(ranked).toHaveLength(MAX_RECOGNITIONS_PER_SCAN);
    expect(ranked.every((c) => c.expression === '')).toBe(true);
  });
});

describe('rankScanCandidates', () => {
  it('sorts by score, descending, keeping ties in input order', () => {
    const base: ScanCandidate = {
      expression: '1',
      rawText: '1',
      confidence: 90,
      confidenceKnown: true,
      variant: 'grayscale',
      psm: 7,
      score: 0,
      substitutions: [],
    };
    const candidates: ScanCandidate[] = [
      { ...base, variant: 'grayscale', score: 10 },
      { ...base, variant: 'otsu', score: 50 },
      { ...base, variant: 'sauvola', score: 10 },
      { ...base, variant: 'sauvola', psm: 13, score: 50 },
    ];

    const ranked = rankScanCandidates(candidates);

    expect(ranked.map((c) => `${c.variant}-psm${c.psm}`)).toEqual([
      'otsu-psm7',
      'sauvola-psm13',
      'grayscale-psm7',
      'sauvola-psm7',
    ]);
  });
});
