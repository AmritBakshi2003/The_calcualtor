import { useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { SCAN_WHITELIST } from './ocr/normalize';

/**
 * Characters the primary OCR passes are constrained to (Phase 1: the scanner
 * alphabet — see ocr/normalize.ts, which owns the single source of truth).
 *
 * With a whitelist active Tesseract reports a confidence of 0 for every word
 * (a reporting quirk; the TEXT is noticeably more accurate) so callers treat
 * confidence 0 as "unknown" and fall back to WHITELIST_CONFIDENCE_FALLBACK
 * when scoring.
 */

/**
 * Parameters the worker is returned to after any one-off pass.
 */
export const OCR_DEFAULT_PARAMS = {
  tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  // Without a DPI hint Tesseract guesses (and warns about) the resolution.
  user_defined_dpi: '300',
  tessedit_char_whitelist: SCAN_WHITELIST,
};

export function useOCRWorker() {
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const initPromiseRef = useRef<Promise<Tesseract.Worker> | null>(null);
  // Bumped on terminate so a worker that finishes initializing afterwards is discarded.
  const epochRef = useRef(0);

  const getWorker = (): Promise<Tesseract.Worker> => {
    if (workerRef.current) {
      return Promise.resolve(workerRef.current);
    }
    // Concurrent callers share one initialization instead of polling.
    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    const epoch = epochRef.current;

    const init = (async () => {
      // Phase 1: LSTM engine only (OEM.LSTM_ONLY). The default combined
      // legacy+LSTM mode is slower and can answer with legacy-engine glyphs
      // the whitelist then mangles.
      const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
        workerPath: `${import.meta.env.BASE_URL}tesseract/worker.min.js`,
        corePath: `${import.meta.env.BASE_URL}tesseract/`,
        langPath: `${import.meta.env.BASE_URL}tesseract/`,
        // Progress logging is only useful while developing.
        logger: import.meta.env.DEV ? (m) => console.debug(m) : () => {},
      });

      try {
        await worker.setParameters(OCR_DEFAULT_PARAMS);
      } catch (error) {
        await worker.terminate();
        throw error;
      }

      if (epoch === epochRef.current) {
        workerRef.current = worker;
      }
      return worker;
    })();

    // On failure, allow the next call to retry from scratch.
    initPromiseRef.current = init.catch((error) => {
      if (epoch === epochRef.current) {
        initPromiseRef.current = null;
      }
      throw error;
    });

    return initPromiseRef.current;
  };

  const terminateWorker = async () => {
    const pending = initPromiseRef.current;
    const current = workerRef.current;
    epochRef.current += 1;
    workerRef.current = null;
    initPromiseRef.current = null;

    try {
      const worker = current ?? (pending ? await pending : null);
      await worker?.terminate();
    } catch {
      // Initialization failed or the worker was already terminated.
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      terminateWorker();
    };
  }, []);

  return {
    getWorker,
    terminateWorker,
  };
}
