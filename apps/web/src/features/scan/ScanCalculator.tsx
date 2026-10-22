import { useState, useRef } from 'react';
import { evaluateExpression } from '@calculator-suite/math-core';
import Tesseract from 'tesseract.js';
import { CameraCapture } from './CameraCapture';
import { CropEditor } from './CropEditor';
import { useOCRWorker, OCR_DEFAULT_PARAMS } from './useOCRWorker';
import { preprocessForOCR } from './ocrPreprocess';
import { postprocessOCR, cleanForEvaluation } from './ocrPostprocess';
import {
  WHITELIST_CONFIDENCE_FALLBACK,
  expressionScore,
  lowConfidenceSymbolCount,
  pickBestCandidate,
  rankSegments,
  type BBox,
  type OcrCandidate,
  type OcrSegment,
} from './ocrScoring';
import { isBlurry } from './blurDetection';
import { classifyPlusOrDivide } from './glyphCheck';

export function ScanCalculator() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);
  const [lowConfidenceIndices, setLowConfidenceIndices] = useState<number[]>([]);
  const [showCropEditor, setShowCropEditor] = useState(false);
  // True once a recognition attempt has finished (even an empty or failed one),
  // so the edit box stays available for typing the expression manually.
  const [hasScanned, setHasScanned] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set when the user edits while a recognition pass is still running; the
  // result must not overwrite what they typed.
  const editedWhileProcessingRef = useRef(false);
  const { getWorker, terminateWorker } = useOCRWorker();

  // Guard against oversized uploads (the accept attribute is only a UI hint).
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Image is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB). Please use a smaller image.`);
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCapture = () => {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback to file input for unsupported browsers
      fileInputRef.current?.click();
      return;
    }
    setShowCamera(true);
  };

  const handleCameraCapture = (imageData: string) => {
    setCapturedImage(imageData);
    setShowCamera(false);

    // Check for blur
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (isBlurry(imageData)) {
          setBlurWarning(true);
        } else {
          setBlurWarning(false);
        }
      }
    };
    img.src = imageData;
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setHasScanned(false);
    setShowCamera(true);
  };

  interface PassOptions {
    psm?: Tesseract.PSM;
    /** '' runs the pass WITHOUT the whitelist (it is the worker default). */
    whitelist?: string;
  }

  const performOCR = async (imageData: string, options: PassOptions = {}): Promise<Tesseract.RecognizeResult> => {
    const worker = await getWorker();

    const overrides: Partial<Tesseract.WorkerParams> = {};
    if (options.psm !== undefined) overrides.tessedit_pageseg_mode = options.psm;
    if (options.whitelist !== undefined) overrides.tessedit_char_whitelist = options.whitelist;
    const hasOverrides = Object.keys(overrides).length > 0;

    try {
      if (hasOverrides) await worker.setParameters(overrides);
      return await worker.recognize(imageData);
    } finally {
      // Always restore defaults, even if recognition threw, so one failed pass
      // cannot leave the shared worker stuck in a different mode.
      if (hasOverrides) {
        try {
          await worker.setParameters(OCR_DEFAULT_PARAMS);
        } catch {
          // Nothing more to do; the next pass sets what it needs.
        }
      }
    }
  };

  /** Raw OCR text -> expression the evaluator accepts. */
  const toExpression = (raw: string) => cleanForEvaluation(postprocessOCR(raw.trim()));

  /** The confidence a recognize result reports, clamped to a sane range. */
  const passConfidence = (data: Tesseract.RecognizeResult['data']): { text: string; confidence: number } => ({
    text: data.text,
    confidence: Math.max(0, Math.min(100, data.confidence ?? 0)),
  });

  /** Tesseract's line segmentation -> segments we can rank and crop to. */
  const toSegments = (result: Tesseract.RecognizeResult): OcrSegment[] =>
    (result.data.lines ?? [])
      .map((line) => ({
        text: line.text ?? '',
        confidence: line.confidence ?? 0,
        bbox: line.bbox
          ? { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 }
          : undefined,
        symbols: (line.words ?? []).flatMap((word) =>
          (word.symbols ?? []).map((symbol) => ({
            text: symbol.text ?? '',
            confidence: symbol.confidence ?? 0,
            bbox: symbol.bbox
              ? { x0: symbol.bbox.x0, y0: symbol.bbox.y0, x1: symbol.bbox.x1, y1: symbol.bbox.y1 }
              : undefined,
          }))
        ),
      }))
      .filter((segment) => segment.text.trim().length > 0);

  /** Copy one line out of the preprocessed canvas, with breathing room. */
  const cropToBbox = (source: HTMLCanvasElement, bbox: BBox): HTMLCanvasElement => {
    const pad = Math.max(6, Math.round((bbox.y1 - bbox.y0) * 0.6));
    const x = Math.max(0, bbox.x0 - pad);
    const y = Math.max(0, bbox.y0 - pad);
    const width = Math.max(1, Math.min(source.width - x, bbox.x1 - bbox.x0 + pad * 2));
    const height = Math.max(1, Math.min(source.height - y, bbox.y1 - bbox.y0 + pad * 2));

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d')?.drawImage(source, x, y, width, height, 0, 0, width, height);
    return out;
  };

  /**
   * Tesseract reads "÷" as "+" on phone photos, and the wrong operator
   * silently evaluates "144÷12" as 156 instead of 12. For the winning
   * candidate only: re-check each "+" glyph's pixels and swap in "/" where
   * the shape says divide. Applied only when every "+" symbol maps 1:1 onto
   * a "+" in the expression, so a partial match cannot corrupt the text.
   *
   * Symbol boxes come from the block pass over the preprocessed image, so the
   * base canvas is the preprocessed one in every case (including 'crop').
   */
  const refinePlusOrDivide = (baseCanvas: HTMLCanvasElement, candidate: OcrCandidate | null): OcrCandidate | null => {
    if (!candidate?.expression || !candidate.segment?.symbols) return candidate;
    const plusSymbols = candidate.segment.symbols.filter((symbol) => symbol.text === '+');
    const plusChars = (candidate.expression.match(/\+/g) ?? []).length;
    if (plusSymbols.length === 0 || plusSymbols.length !== plusChars) return candidate;
    if (plusSymbols.some((symbol) => !symbol.bbox)) return candidate;

    const ctx = baseCanvas.getContext('2d');
    if (!ctx) return candidate;

    let expression = candidate.expression;
    let changed = false;
    let plusIndex = 0;
    for (const symbol of plusSymbols) {
      const bbox = symbol.bbox!;
      const padX = Math.round((bbox.x1 - bbox.x0) * 0.15);
      const padY = Math.round((bbox.y1 - bbox.y0) * 0.15);
      const x = Math.max(0, bbox.x0 - padX);
      const y = Math.max(0, bbox.y0 - padY);
      const width = Math.max(1, Math.min(baseCanvas.width - x, bbox.x1 - bbox.x0 + 1 + padX * 2));
      const height = Math.max(1, Math.min(baseCanvas.height - y, bbox.y1 - bbox.y0 + 1 + padY * 2));

      let gray: ImageData;
      try {
        gray = ctx.getImageData(x, y, width, height);
      } catch {
        // Cross-origin canvases throw; fall back to the uncorrected reading.
        return candidate;
      }
      if (classifyPlusOrDivide(gray) !== 'divide') {
        plusIndex++;
        continue;
      }

      // Replace the plusIndex-th "+" char with "/" (the cleaned form of "÷").
      let seen = -1;
      expression = expression.replace(/\+/g, () => {
        seen++;
        return seen === plusIndex ? '/' : '+';
      });
      changed = true;
      plusIndex++;
    }

    if (!changed) return candidate;
    const improved = {
      ...candidate,
      expression,
      score: expressionScore(expression, candidate.confidence, expression),
    };
    // A "\u00f7" misread as a broken plus would turn into an expression that no
    // longer parses; keep whichever reading scored better.
    return improved.score >= candidate.score ? improved : candidate;
  };

  /** Run every OCR pass over a preprocessed image and return the best candidate. */
  const runRecognition = async (preprocessedCanvas: HTMLCanvasElement): Promise<OcrCandidate | null> => {
    // PNG (lossless) preserves crisp digit edges; JPEG artifacts degrade OCR.
    const preprocessedImageData = preprocessedCanvas.toDataURL('image/png');

    const candidates: OcrCandidate[] = [];
    /** Confidence depending on whether the pass could actually report one. */
    const honestConfidence = (
      pass: { text: string; confidence: number },
      confidenceKnown: boolean
    ): { confidence: number; confidenceKnown: boolean } => {
      const reads = pass.confidence > 0;
      return {
        confidence: reads ? pass.confidence : WHITELIST_CONFIDENCE_FALLBACK,
        confidenceKnown: confidenceKnown && reads,
      };
    };
    const consider = (
      source: OcrCandidate['source'],
      raw: string,
      pass: { text: string; confidence: number },
      confidenceKnown: boolean,
      segment?: OcrSegment
    ) => {
      const expression = toExpression(raw);
      const honest = honestConfidence(pass, confidenceKnown);
      candidates.push({
        source,
        expression,
        confidence: honest.confidence,
        confidenceKnown: honest.confidenceKnown,
        segment,
        score: expressionScore(expression, honest.confidence, raw),
      });
    };

    // 1) Block pass, whitelist on: also segments the image into lines, which
    // is what lets us find the expression on a receipt or a screenshot full of
    // other numbers. Whitelist confidence is a reporting quirk (always 0) —
    // see useOCRWorker.ts.
    const block = await performOCR(preprocessedImageData, { psm: Tesseract.PSM.SINGLE_BLOCK });
    const ranked = rankSegments(toSegments(block));

    consider('block', block.data.text, passConfidence(block.data), false, ranked[0]);
    for (const line of ranked.slice(0, 3)) {
      consider('line', line.text, { text: line.text, confidence: line.confidence }, false, line);
    }

    // 2) Block pass, whitelist off: real confidence, and the only pass that can
    // emit glyphs outside OCR_WHITELIST ("2+3" reads as "iy" without one, but
    // the matched-to-whitelist reading can also be wrong).
    const blockOpen = await performOCR(preprocessedImageData, {
      psm: Tesseract.PSM.SINGLE_BLOCK,
      whitelist: '',
    });
    const rankedOpen = rankSegments(toSegments(blockOpen));
    consider('block-open', blockOpen.data.text, passConfidence(blockOpen.data), true, rankedOpen[0]);
    for (const line of rankedOpen.slice(0, 3)) {
      consider('line-open', line.text, { text: line.text, confidence: line.confidence }, true, line);
    }

    // Re-read the winning line on its own: neighbouring text pulls the
    // recognizer towards the wrong glyphs even when segmentation was right.
    if (ranked.length > 1 && ranked[0].bbox) {
      const cropped = cropToBbox(preprocessedCanvas, ranked[0].bbox);
      const cropResult = await performOCR(cropped.toDataURL('image/png'), {
        psm: Tesseract.PSM.SINGLE_LINE,
      });
      consider('crop', cropResult.data.text, passConfidence(cropResult.data), false, ranked[0]);
    }

    let best = pickBestCandidate(candidates);

    // Last resort: one line over the whole image. Photos with a busy
    // background sometimes segment into fragments the block pass garbles.
    if (!best || best.score < 25) {      const single = await performOCR(preprocessedImageData, { psm: Tesseract.PSM.SINGLE_LINE });
      consider('fallback', single.data.text, passConfidence(single.data), false, ranked[0]);
      best = pickBestCandidate(candidates) ?? best;
    }

    return refinePlusOrDivide(preprocessedCanvas, best);
  };

  const handleRecognize = async () => {
    if (!capturedImage) {
      setError('Please capture or upload an image first');
      return;
    }

    setIsProcessing(true);
    editedWhileProcessingRef.current = false;
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);

    try {
      // Preprocess image
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load the image'));
        img.src = capturedImage;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      ctx.drawImage(img, 0, 0);

      const preprocessedCanvas = preprocessForOCR(canvas);
      let best = await runRecognition(preprocessedCanvas);

      // An engine stuck in a bad state — an outdated cached worker.min.js, or
      // a half-downloaded language file — returns nothing usable WITHOUT
      // throwing, so the user just sees a stray character. Discarding the
      // worker and running the passes once more recovers automatically.
      if (!best?.expression) {
        await terminateWorker();
        best = await runRecognition(preprocessedCanvas);
      }

      const processedText = best?.expression ?? '';
      // Whitelist passes report confidence 0 no matter how accurate the text
      // was (= WHITELIST_CONFIDENCE_FALLBACK), so a score is only shown when
      // the winning pass could actually measure one.
      const confidenceKnown = best?.confidenceKnown ?? false;
      const lowCount = confidenceKnown ? lowConfidenceSymbolCount(best?.segment) : 0;
      setLowConfidenceIndices(Array.from({ length: lowCount }, (_, i) => i));

      if (!editedWhileProcessingRef.current) {
        setRecognizedText(processedText);
        // A confidence score is meaningless when nothing was read.
        setConfidence(processedText && confidenceKnown ? best?.confidence ?? null : null);
      }

      if (!processedText) {
        setError(
          'Nothing readable was found. The scanner engine has been reloaded — press Recognize Text to try again, crop closer to the expression, or type it below.'
        );
      }
    } catch (err) {
      console.error('OCR failed:', err);
      // Drop the worker so the next attempt starts from a clean engine.
      await terminateWorker();
      setError(
        'Failed to recognize text from image. The scanner engine has been reloaded — press Recognize Text to try again, or type the expression below.'
      );
    } finally {
      setHasScanned(true);
      setIsProcessing(false);
    }
  };

  const handleSolve = () => {
    // Clean again: the user may have edited the text (typed ×, ÷, a trailing "=", ...)
    const expression = cleanForEvaluation(recognizedText);
    if (!expression) {
      setError('No expression to solve');
      return;
    }

    // OCR often reads one number as two ("2 3"). The evaluator rejects that
    // with a cryptic error, so explain what to fix instead of evaluating.
    if (/\d\s+\d/.test(expression)) {
      setError('Missing operator between numbers - edit the box');
      setResult(null);
      return;
    }

    try {
      const evalResult = evaluateExpression(expression);
      if (evalResult.success) {
        setResult(evalResult.result as string);
        setError(null);
      } else {
        setError(evalResult.error || 'Invalid expression');
        setResult(null);
      }
    } catch (err) {
      setError('Failed to evaluate expression');
      setResult(null);
    }
  };

  const handleCropApply = (croppedDataUrl: string) => {
    setCapturedImage(croppedDataUrl);
    setShowCropEditor(false);
    // A new image invalidates any previous recognition result
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setLowConfidenceIndices([]);
    setHasScanned(false);
  };

  const handleReset = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);
    setHasScanned(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-0 space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
          Scan Calculator
        </h2>

        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-200">
            ℹ️ Scanner v1: Supports printed arithmetic and simple expressions. Handwriting, fractions, and advanced equations are not supported.
          </p>
        </div>

        {/* Image Input Section */}
        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <button
              onClick={handleCapture}
              className="w-full sm:flex-1 p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-xs sm:text-sm"
            >
              📷 Capture Camera
            </button>
            <label className="w-full sm:flex-1">
              <span className="block w-full p-3 sm:p-4 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center cursor-pointer text-xs sm:text-sm">
                📁 Upload Image
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {capturedImage && (
            <div className="relative">
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full max-h-48 sm:max-h-64 object-contain rounded-lg border border-gray-300 dark:border-gray-600"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => setShowCropEditor(true)}
                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  aria-label="Crop image"
                  title="Crop image"
                >
                  ✂️
                </button>
                <button
                  onClick={handleRetake}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  aria-label="Retake photo"
                >
                  🔄
                </button>
                <button
                  onClick={handleReset}
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  aria-label="Clear image"
                >
                  ✕
                </button>
              </div>
              {blurWarning && (
                <div className="absolute bottom-2 left-2 right-2 p-2 bg-yellow-100 dark:bg-yellow-900/80 text-yellow-800 dark:text-yellow-200 text-xs rounded-lg">
                  ⚠️ Image looks blurry, try retaking
                </div>
              )}
            </div>
          )}
        </div>

        {/* OCR Section */}
        {capturedImage && (
          <div className="mb-4 sm:mb-6">
            <button
              onClick={handleRecognize}
              disabled={isProcessing}
              className="w-full p-3 sm:p-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              {isProcessing ? 'Processing...' : '🔍 Recognize Text'}
            </button>
          </div>
        )}

        {/* Recognized Text Section */}
        {(recognizedText || hasScanned) && (
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
            <div>
              <label
                htmlFor="recognized-expression"
                className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2"
              >
                Recognized Expression (Edit if needed)
              </label>
              <textarea
                id="recognized-expression"
                value={recognizedText}
                onChange={(e) => {
                  // Editing invalidates the previous result, error and highlights
                  if (isProcessing) editedWhileProcessingRef.current = true;
                  setRecognizedText(e.target.value);
                  setResult(null);
                  setError(null);
                  setLowConfidenceIndices([]);
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-describedby="recognized-expression-hint"
                // 16px keeps iOS Safari from zooming the page when the box is
                // focused — without it, correcting a digit is almost unusable.
                className="w-full p-3 sm:p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-base sm:text-sm leading-relaxed"
                rows={2}
                placeholder="Recognized expression will appear here"
              />
              <p id="recognized-expression-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Tap the box to correct a misread digit before solving.
              </p>
              {confidence !== null && (
                <div className="mt-1 sm:mt-2 text-xs sm:text-sm">
                  <span className={`font-medium ${confidence < 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                    Confidence: {confidence.toFixed(2)}%
                  </span>
                  {confidence < 70 && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                      ⚠️ Low confidence - please verify
                    </span>
                  )}
                  {lowConfidenceIndices.length > 0 && (
                    <span className="ml-2 text-orange-600 dark:text-orange-400">
                      🔍 {lowConfidenceIndices.length} character(s) need attention
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSolve}
              className="w-full p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-xs sm:text-sm"
            >
              Solve Expression
            </button>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm sm:text-base">Result</h4>
            <div className="text-xl sm:text-2xl font-mono text-green-700 dark:text-green-400">
              {result}
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm sm:text-base">Error</h4>
            <p className="text-red-700 dark:text-red-400 text-xs sm:text-sm">{error}</p>
          </div>
        )}

        {/* Offline Message */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">
            ℹ️ First scan loads the OCR engine (~10 MB). Later scans work offline once cached.
          </p>
        </div>
      </div>

      {/* Camera Capture Overlay */}
      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />

      {/* Crop Editor Overlay */}
      {showCropEditor && capturedImage && (
        <CropEditor
          imageSrc={capturedImage}
          onApply={handleCropApply}
          onCancel={() => setShowCropEditor(false)}
        />
      )}

      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
