import { useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';

export function useOCRWorker() {
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const isInitializingRef = useRef(false);

  const getWorker = async (): Promise<Tesseract.Worker> => {
    if (workerRef.current) {
      return workerRef.current;
    }

    if (isInitializingRef.current) {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return getWorker();
    }

    isInitializingRef.current = true;

    try {
      const worker = await Tesseract.createWorker('eng', Tesseract.OEM.DEFAULT, {
        workerPath: `${import.meta.env.BASE_URL}tesseract/worker.min.js`,
        corePath: `${import.meta.env.BASE_URL}tesseract/`,
        langPath: `${import.meta.env.BASE_URL}tesseract/`,
        logger: (m) => console.log(m),
      });

      // Set parameters for better OCR accuracy
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789+-*/×÷().,=^%',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      });

      workerRef.current = worker;
      isInitializingRef.current = false;
      return worker;
    } catch (error) {
      isInitializingRef.current = false;
      throw error;
    }
  };

  const terminateWorker = async () => {
    if (workerRef.current) {
      await workerRef.current.terminate();
      workerRef.current = null;
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
