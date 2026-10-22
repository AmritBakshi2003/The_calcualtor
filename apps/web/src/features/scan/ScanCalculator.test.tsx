import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScanCalculator } from './ScanCalculator';

const { worker } = vi.hoisted(() => ({
  worker: {
    setParameters: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn(),
  },
}));

const terminateWorker = vi.fn().mockResolvedValue(undefined);

vi.mock('tesseract.js', () => ({
  default: { PSM: { SINGLE_LINE: '7', SINGLE_BLOCK: '6' } },
}));

vi.mock('./useOCRWorker', () => ({
  useOCRWorker: () => ({ getWorker: async () => worker, terminateWorker }),
  OCR_DEFAULT_PARAMS: {},
}));

// jsdom has no canvas: stand in for the preprocessing output
vi.mock('./ocrPreprocess', () => ({
  preprocessForOCR: () => ({ toDataURL: () => 'data:image/png;base64,AAAA' }),
}));

const ocrText = (text: string, confidence = 90) => ({ data: { text, confidence, lines: [] } });

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the edit box when OCR finds nothing, so the expression can be typed by hand', async () => {
    worker.recognize.mockResolvedValue(ocrText(''));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    expect(await screen.findByText(/nothing readable was found/i)).toBeTruthy();

    fireEvent.change(box, { target: { value: '2+3' } });
    fireEvent.click(screen.getByRole('button', { name: /solve expression/i }));

    expect(await screen.findByText('5')).toBeTruthy();
  });

  it('does not unmount the edit box when the text is cleared', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+2'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByLabelText(/recognized expression/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /solve expression/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/recognized expression/i), { target: { value: '6×7' } });
    fireEvent.click(screen.getByRole('button', { name: /solve expression/i }));
    expect(await screen.findByText('42')).toBeTruthy();
  });

  it('solves text with a trailing "=" (common on calculator screens)', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3='));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('2+3'));
    fireEvent.click(screen.getByRole('button', { name: /solve expression/i }));
    expect(await screen.findByText('5')).toBeTruthy();
  });

  it('clears a stale result as soon as the text is edited', async () => {
    worker.recognize.mockResolvedValue(ocrText('2+3'));
    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    fireEvent.click(screen.getByRole('button', { name: /solve expression/i }));
    expect(await screen.findByText('5')).toBeTruthy();

    fireEvent.change(box, { target: { value: '2+4' } });
    expect(screen.queryByText('5')).toBeNull();
  });

  it('reloads the scanner engine and retries when the first attempt reads nothing', async () => {
    // A stuck engine (stale cached worker, half-downloaded language data)
    // returns junk without throwing: "150514" on the image, "." in the box.
    worker.recognize
      .mockResolvedValueOnce(ocrText('.')) // engine 1, block pass: garbage
      .mockResolvedValueOnce(ocrText('.')) // engine 1, fallback pass: garbage
      .mockResolvedValueOnce(ocrText('150514')); // freshly created engine

    const box = (await uploadAndRecognize()) as HTMLTextAreaElement;

    await waitFor(() => expect(box.value).toBe('150514'));
    expect(terminateWorker).toHaveBeenCalled();
    // the error copy tells the user what happened when it cannot recover
    expect(worker.recognize.mock.calls.length).toBeGreaterThan(1);
  });

  it('restores default OCR parameters even when a retry pass throws', async () => {
    worker.recognize
      .mockResolvedValueOnce(ocrText('', 10)) // first pass: unusable
      .mockRejectedValueOnce(new Error('boom')); // retry pass throws
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await uploadAndRecognize();

    await waitFor(() => expect(screen.getByText(/failed to recognize/i)).toBeTruthy());
    // it failed for the intended reason, not an unrelated TypeError
    expect(String(consoleError.mock.calls[0]?.[1])).toContain('boom');
    // last setParameters call must be the reset to defaults ({}), not the PSM override
    const last = worker.setParameters.mock.calls.at(-1)?.[0];
    expect(last).toEqual({});
    // and the edit box is still there for manual entry
    expect(screen.getByLabelText(/recognized expression/i)).toBeTruthy();
  });
});
