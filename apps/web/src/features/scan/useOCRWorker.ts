import { useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';

/**
 * Characters the primary OCR passes are constrained to.
 *
 * With a whitelist active Tesseract reports a confidence of 0 for every word
 * (a reporting quirk; the TEXT is noticeably more accurate) so callers treat
 * confidence 0 as "unknown" and fall back to WHITELIST_CONFIDENCE_FALLBACK
 * when scoring. One open pass per scan keeps an unbiased candidate in play: a
 * whitelist forces unmatchable glyphs onto the nearest allowed character, so
 * the open pass can still win when the real text has other glyphs.
 */
// "√" and "π" stay on the list: removing them made Tesseract coerce a radical
// or pi glyph onto the nearest digit/operator and silently change the value.
// cleanForEvaluation maps them to sqrt/pi after recognition.
export const OCR_WHITELIST = '0123456789+-*/×÷().,=^%xX√π';

/**
 * Parameters the worker is returned to after any one-off pass.
 */
export const OCR_DEFAULT_PARAMS = {
  tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  // Without a DPI hint Tesseract guesses (and warns about) the resolution.
  user_defined_dpi: '300',
  tessedit_char_whitelist: OCR_WHITELIST,
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
      const worker = await Tesseract.createWorker('eng', Tesseract.OEM.DEFAULT, {
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
