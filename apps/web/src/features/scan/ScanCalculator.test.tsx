import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScanCalculator } from './ScanCalculator';
import { requestConsensus, requestOcrSpace } from './scanEngineClient';

const { worker } = vi.hoisted(() => ({
  worker: {
    setParameters: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn(),
  },
}));

const terminateWorker = vi.fn().mockResolvedValue(undefined);

vi.mock('tesseract.js', () => ({
  default: { PSM: { SINGLE_LINE: '7', RAW_LINE: '13' } },
}));

vi.mock('./useOCRWorker', () => ({
  useOCRWorker: () => ({ getWorker: async () => worker, terminateWorker }),
  OCR_DEFAULT_PARAMS: {},
}));

// jsdom has no canvas: stand in for the preprocessing output
vi.mock('./ocrPreprocess', () => ({
  preprocessForOCR: () => ({ toDataURL: () => 'data:image/png;base64,AAAA' }),
}));

// jsdom has no canvas for the variant builder either: one fake canvas per
// Phase-1 variant (grayscale, Otsu, Sauvola)
vi.mock('./ocr/preprocess', () => ({
  buildVariants: () =>
    (['grayscale', 'otsu', 'sauvola'] as const).map((name) => ({
      name,
      canvas: { toDataURL: () => 'data:image/png;base64,AAAA' },
    })),
}));

// The server engines are HTTP calls; every test mocks them explicitly.
// Defaults: OCR.space unconfigured, consensus answers nothing (the local
// reading stands) — keeps the existing local-flow tests focused.
vi.mock('./scanEngineClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scanEngineClient')>();
  return {
    ...actual,
    requestOcrSpace: vi.fn(async () => ({ available: false, reason: 'not_configured' })),
    requestConsensus: vi.fn(async () => ({
      expression: '',
      verified: false,
      sources: [],
      alternatives: [],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:skipped:not_configured'],
    })),
  };
});

const ocrText = (text: string, confidence = 90) => ({ data: { text, confidence, lines: [] } });

// One scan = 3 variants × PSM 7/13 = 6 recognitions (Phase-1 cap).
const CALLS_PER_SCAN = 6;

class FakeImage {
  width = 100;
  height = 40;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

async function uploadAndRecognize() {
  const { container } = render(<ScanCalculator />);
  const input = container.querySelector('input[type="file"][accept="image/jpeg,image/png,image/webp"]') as HTMLInputElement;
  const file = new File(['x'], 'expr.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });

  const recognize = await screen.findByRole('button', { name: /recognize text/i });
  fireEvent.click(recognize);
  return await screen.findByLabelText(/recognized expression/i);
}

describe('ScanCalculator editing', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    // restoreAllMocks() in afterEach strips vi.fn() implementations, so set them every time
    worker.setParameters.mockReset().mockResolvedValue(undefined);
    worker.recognize.mockReset();
    terminateWorker.mockReset().mockResolvedValue(undefined);
    vi.mocked(requestOcrSpace).mockResolvedValue({ available: false, reason: 'not_configured' });
    vi.mocked(requestConsensus).mockResolvedValue({
      expression: '',
      verified: false,
      sources: [],
      alternatives: [],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:skipped:not_configured'],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockConsensus = (result: Partial<Awaited<ReturnType<typeof requestConsensus>>>) => {
    vi.mocked(requestConsensus).mockResolvedValue({
      expression: '',
      verified: false,
      sources: [],
      alternatives: [],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:skipped:not_configured'],
      ...result,
    } as Awaited<ReturnType<typeof requestConsensus>>);
  };

  it('keeps the edit box when OCR finds nothing, so the expression can be typed by hand', async () => {
    worker.recognize.mockResolvedValue(ocrText(''));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    expect(await screen.findByText(/nothing readable was found/i)).toBeTruthy();

    fireEvent.change(box, { target: { value: '2+3' } });
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));

    expect(await screen.findByText('5')).toBeTruthy();
  });

  it('does not unmount the edit box when the text is cleared', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+2'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByLabelText(/recognized expression/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /solve (expression|anyway)/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/recognized expression/i), { target: { value: '6×7' } });
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByText('42')).toBeTruthy();
  });

  it('solves text with a trailing "=" (common on calculator screens)', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3='));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByText('5')).toBeTruthy();
  });

  it('clears a stale result as soon as the text is edited', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByText('5')).toBeTruthy();

    fireEvent.change(box, { target: { value: '2+4' } });
    expect(screen.queryByText('5')).toBeNull();
  });

  it('reloads the scanner engine and retries when the first attempt reads nothing', async () => {
    // A stuck engine (stale cached worker, half-downloaded language data)
    // returns junk without throwing: "150514" on the image, "." in the box.
    // One scan now runs 6 variant passes (3 variants × PSM 7/13) before any
    // retry, so engine 1 must return garbage for all six.
    let calls = 0;
    worker.recognize.mockImplementation(() => {
      calls++;
      return calls <= CALLS_PER_SCAN
        ? Promise.resolve(ocrText('.'))
        : Promise.resolve(ocrText('150514'));
    });

    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('150514'));
    expect(terminateWorker).toHaveBeenCalled();
    // the retry ran a full second pass set after the engine reload
    expect(worker.recognize.mock.calls.length).toBe(CALLS_PER_SCAN * 2);
  });

  it('restores default OCR parameters even when every pass throws', async () => {
    worker.recognize.mockRejectedValue(new Error('boom'));
    await uploadAndRecognize();

    await waitFor(() => expect(screen.getByText(/Nothing readable was found/i)).toBeTruthy());
    // last setParameters call must be the reset to defaults ({}), not the PSM override
    const last = worker.setParameters.mock.calls.at(-1)?.[0];
    expect(last).toEqual({});
    // and the edit box is still there for manual entry
    expect(screen.getByLabelText(/recognized expression/i)).toBeTruthy();
  });

  it('strips whitespace so a spaced misread still evaluates ("2 3" -> 23)', async () => {
    // Phase-1 normalize removes all whitespace: OCR often reads one number
    // as two spaced numbers, and the spacing itself is never meaningful.
    worker.recognize.mockResolvedValue(ocrText('2 3'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('23'));
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByTestId('scan-result')).toHaveTextContent('23');
  });

  it('still solves thousands separators after the whitelist filter', async () => {
    // The comma is outside the scan alphabet and is dropped: "1,000+5" -> "1000+5"
    worker.recognize.mockResolvedValue(ocrText('1,000+5'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('1000+5'));
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByText('1005')).toBeTruthy();
  });

  it('shows no confidence when the whitelist pass reports 0', async () => {
    // With the whitelist active Tesseract reports confidence 0 even when it
    // read the text right (reporting quirk). The text is still trusted; no
    // meaningless "Confidence: 0.00" is displayed.
    worker.recognize.mockResolvedValue(ocrText('2+3', 0));

    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    expect(screen.queryByText(/confidence:/i)).toBeNull();
    expect(screen.queryByText(/character\(s\)/i)).toBeNull();
  });

  it('drops characters outside the scan whitelist ("2O + 2" -> "2+2")', async () => {
    // normalize removes look-alike letters instead of guessing a substitution:
    // the reading is conservative and the user can retype what was lost.
    worker.recognize.mockResolvedValue(ocrText('2O + 2'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+2'));
    // No "auto-corrected" warning: O was dropped, not substituted.
    expect(screen.queryByText(/auto-corrected/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /solve (expression|anyway)/i }));
    expect(await screen.findByText('4')).toBeTruthy();
  });

  it('offers a rotate action for rotated images', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+2'));
    await uploadAndRecognize();

    const rotate = await screen.findByRole('button', { name: /rotate image/i });
    expect(rotate).toBeTruthy();
  });

  it('fails rotation gracefully when the image cannot be re-encoded', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+2'));
    await uploadAndRecognize();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Simulate an environment where the image cannot be encoded to PNG
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new Error('Failed to encode the rotated image');
    });

    fireEvent.click(screen.getByRole('button', { name: /rotate image/i }));

    expect(await screen.findByText(/failed to rotate/i)).toBeTruthy();
    expect(consoleError.mock.calls.some((call) => String(call[1]).includes('encode'))).toBe(true);
  });

  it('shows the verified badge and the engine sources for a consensus result', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    mockConsensus({
      expression: '2+3',
      verified: true,
      sources: ['tesseract:grayscale-psm7', 'ocrspace'],
      stages: ['cache:miss', 'decide:consensus'],
    });
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    const badge = await screen.findByTestId('verification-badge');
    expect(badge.textContent).toContain('Verified');
    expect(badge.textContent).not.toContain('Unverified');
    const sources = screen.getByTestId('engine-sources');
    expect(sources.textContent).toContain('Tesseract');
    expect(sources.textContent).toContain('OCR.space');
  });

  it('unverified result: badge, tappable alternatives, and no auto-solve', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    mockConsensus({
      expression: '2+3',
      verified: false,
      alternatives: ['2×3', '2+8'],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:gemini-3.5-flash-lite:no_match'],
    });
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    expect((await screen.findByTestId('verification-badge')).textContent).toContain('Unverified');

    // Nothing is solved automatically: no result appears without a tap.
    expect(screen.queryByTestId('scan-result')).toBeNull();

    // Alternatives are tappable and fill the box; solving still needs a tap.
    fireEvent.click(screen.getByRole('button', { name: '2×3' }));
    expect(box.value).toBe('2×3');
    expect(screen.queryByTestId('scan-result')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /solve anyway/i }));
    expect(await screen.findByTestId('scan-result')).toHaveTextContent('6');
  });

  it('a busy Gemini shows a short plain message and a skipped stage', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    mockConsensus({
      expression: '2+3',
      verified: false,
      sources: ['tesseract:grayscale-psm7'],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:gemini-3.5-flash-lite:429:busy'],
    });
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    expect(await screen.findByText('Gemini is busy — try again shortly.')).toBeTruthy();
    const geminiRow = document.querySelector('li[data-stage="gemini"]');
    expect(geminiRow?.getAttribute('data-state')).toBe('skipped');
  });

  it('a failing OCR.space engine shows a short plain message', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    vi.mocked(requestOcrSpace).mockResolvedValue({ available: false, reason: 'timeout' });
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    expect(await screen.findByText('OCR.space timed out.')).toBeTruthy();
    expect(document.querySelector('li[data-stage="ocrspace"]')?.getAttribute('data-state')).toBe(
      'skipped'
    );
  });

  it('drives the stage list from the pipeline and finishes with Final check', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    mockConsensus({
      expression: '2+3',
      verified: true,
      sources: ['tesseract:grayscale-psm7'],
      stages: ['cache:miss', 'decide:consensus'],
    });
    await uploadAndRecognize();

    const list = await screen.findByTestId('scan-stages');
    const states = Object.fromEntries(
      Array.from(list.querySelectorAll('li')).map((row) => [
        row.getAttribute('data-stage'),
        row.getAttribute('data-state'),
      ])
    );
    expect(states.prepare).toBe('done');
    expect(states.tesseract).toBe('done');
    expect(states.ocrspace).toBe('skipped'); // mocked unconfigured
    expect(states.compare).toBe('done');
    expect(states.final).toBe('done');
    // Consensus reached: the Gemini row was never needed, so it stays hidden.
    expect(states.gemini).toBeUndefined();
  });

  it('keeps the local reading when the consensus service is unreachable', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    vi.mocked(requestConsensus).mockRejectedValue(new Error('consensus_http_503'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    expect(await screen.findByText('The comparison service is unreachable.')).toBeTruthy();
    expect((await screen.findByTestId('verification-badge')).textContent).toContain('Unverified');
  });
});
