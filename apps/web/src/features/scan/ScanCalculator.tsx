import { useEffect, useRef, useState } from 'react';
import { evaluateExpression } from '@calculator-suite/math-core';
import { CameraCapture } from './CameraCapture';
import { CropEditor } from './CropEditor';
import { useOCRWorker } from './useOCRWorker';
import { preprocessForOCR } from './ocrPreprocess';
import { postprocessOCR, cleanForEvaluation } from './ocrPostprocess';
import { rotateCanvas90 } from './imageUtils';
import {
  lowConfidenceSymbolCount,
  pickBestCandidate,
  type OcrCandidate,
} from './ocrScoring';
import { recognizeScanCandidates, type ScanCandidate } from './ocr/recognize';
import { isBlurry } from './blurDetection';
import {
  fetchGeminiCapabilities,
  GeminiUnavailableError,
  recognizeWithGemini,
  solveWithGemini,
} from './geminiClient';
import { assessComplexity, findUnknownWord } from './complexity';

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
  const [isRotating, setIsRotating] = useState(false);
  // Ambiguous characters the winning pass auto-corrected ("O"→"0"), shown as
  // a warning instead of hiding the correction silently.
  const [ambiguousCorrections, setAmbiguousCorrections] = useState<string[]>([]);
  // True once a recognition attempt has finished (even an empty or failed one),
  // so the edit box stays available for typing the expression manually.
  const [hasScanned, setHasScanned] = useState(false);
  // Same-origin Gemini API availability (null = probe still running).
  const [geminiEnabled, setGeminiEnabled] = useState<boolean | null>(null);
  // Which engine produced the recognized text: 'gemini' (cross-validated),
  // 'local', or null (nothing recognized yet).
  const [recognitionSource, setRecognitionSource] = useState<'gemini' | 'local' | null>(null);
  // True when Gemini and Tesseract returned different readings for the same
  // scan — the user must verify before trusting either.
  const [engineDisagreement, setEngineDisagreement] = useState(false);
  // Degradation notice when the Gemini call did not succeed (missing key,
  // rate limit, offline). Local recognition continues to carry the scan.
  const [geminiMessage, setGeminiMessage] = useState<string | null>(null);
  // False when Gemini read something but its independent verification pass
  // could not confirm it against the ink — the result ships but is flagged.
  const [geminiVerified, setGeminiVerified] = useState(false);
  // True while a Gemini solve call is in flight.
  const [geminiBusy, setGeminiBusy] = useState(false);
  // True when the displayed result was computed by Gemini (complex question).
  const [solvedByGemini, setSolvedByGemini] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set when the user edits while a recognition pass is still running; the
  // result must not overwrite what they typed.
  const editedWhileProcessingRef = useRef(false);
  const { getWorker, terminateWorker } = useOCRWorker();

  // Probe the same-origin capabilities once: ON = Gemini cross-validation is
  // available, OFF/null = the scanner silently stays local-only.
  useEffect(() => {
    let alive = true;
    fetchGeminiCapabilities().then((caps) => {
      if (alive) setGeminiEnabled(caps.gemini);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Reset everything a fresh recognition attempt must not inherit. */
  const resetRecognitionState = () => {
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);
    setAmbiguousCorrections([]);
    setGeminiMessage(null);
    setEngineDisagreement(false);
    setRecognitionSource(null);
    setSolvedByGemini(false);
    setGeminiVerified(false);
  };

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

  /**
   * Copy the local OCR machinery untouched; when the same-origin Gemini
   * layer is available, its answer is cross-checked against the local
   * winner below (Gemini wins — the user still sees a disagreement
   * warning when both engines read different characters).
   */
  /** Raw OCR text -> expression the evaluator accepts. */
  const toExpression = (raw: string) => cleanForEvaluation(postprocessOCR(raw.trim()));

  /** Map a Phase-1 scan candidate onto the candidate shape the component ranks. */
  const toComponentCandidate = (candidate: ScanCandidate): OcrCandidate => ({
    source: 'variant',
    expression: candidate.expression,
    confidence: candidate.confidence,
    confidenceKnown: candidate.confidenceKnown,
    score: candidate.score,
    segment: candidate.segment,
    substitutions: candidate.substitutions,
    rawText: candidate.rawText,
  });

  /**
   * Recognize via the Phase-1 pipeline: three preprocessing variants
   * (grayscale, Otsu, Sauvola), each read with PSM 7 and PSM 13 under the
   * LSTM engine and the scan whitelist — at most 6 recognitions per scan —
   * then normalize, score and rank the readings. Returns the best candidate,
   * or null when no variant produced a valid expression (the caller reloads
   * the engine and retries once).
   */
  const runRecognition = async (preprocessedCanvas: HTMLCanvasElement): Promise<OcrCandidate | null> => {
    const scanCandidates = await recognizeScanCandidates(preprocessedCanvas, getWorker);
    return pickBestCandidate(scanCandidates.map(toComponentCandidate));
  };

  const handleRecognize = async () => {
    if (!capturedImage) {
      setError('Please capture or upload an image first');
      return;
    }

    setIsProcessing(true);
    editedWhileProcessingRef.current = false;
    setError(null);
    resetRecognitionState();

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

      // Classic local pipeline first — it is instant, offline, and produces
      // the OCR hint (or the fallback flag) the vision layer cross-examines.
      const localBest = best;
      // Candidates carry the normalized ×/÷ form; the evaluator and the edit
      // box take the ASCII-cleaned form ("2×3" -> "2*3", "2+3=5" -> "2+3").
      let processedText = localBest ? toExpression(localBest.expression) : '';
      let source: 'gemini' | 'local' | null = processedText ? 'local' : null;
      let disagreement = false;

      if (geminiEnabled) {
        try {
          const hint = localBest?.rawText?.trim() ? localBest.rawText.trim() : null;
          // The preprocessed crop (grayscale, contrast-normalized, deskewed,
          // cropped to the ink) travels along as a second image: through
          // camera glare, shadows and colour noise it is often the sharper
          // read, and the payload alone is a weak, frequently wrong hint.
          let enhanced: string | null = null;
          try {
            const preUrl = preprocessedCanvas.toDataURL('image/png');
            enhanced = preUrl.startsWith('data:image') ? preUrl : null;
          } catch {
            enhanced = null;
          }
          const gemini = await recognizeWithGemini(capturedImage, hint, enhanced);
          setGeminiVerified(gemini.verified);
          if (gemini.expression) {
            // Spacing is presentation: compare compacted readings so a
            // harmless space difference cannot hide a real correction.
            const normalizedLocal = processedText.replace(/\s+/g, '');
            disagreement = Boolean(normalizedLocal) && gemini.expression !== normalizedLocal;
            processedText = gemini.expression;
            source = 'gemini';
          }
          // gemini.unreadable && processedText → the local reading stands.
          // gemini.unreadable && !processedText → the "nothing readable"
          // message below applies to both engines.
        } catch (error) {
          // Any Gemini failure degrades to the proven local flow.
          setGeminiMessage(
            error instanceof GeminiUnavailableError
              ? `${error.message} Local recognition is still active.`
              : 'Gemini is unreachable — local recognition is still active.'
          );
          if (import.meta.env.DEV) console.warn('Gemini recognition failed:', error);
        }
      }

      // A per-character confidence only exists for the winning LOCAL pass;
      // a Gemini-validated result shows its cross-check state instead.
      const confidenceKnown = source === 'local' ? (localBest?.confidenceKnown ?? false) : false;
      const lowCount = confidenceKnown ? lowConfidenceSymbolCount(localBest?.segment) : 0;
      setLowConfidenceIndices(Array.from({ length: lowCount }, (_, i) => i));

      if (!editedWhileProcessingRef.current) {
        setRecognizedText(processedText);
        // A confidence score is meaningless when nothing was read.
        setConfidence(processedText && confidenceKnown ? localBest?.confidence ?? null : null);
        // Surface which ambiguous characters were auto-corrected so a misread
        // like "O" keeps getting caught even when confidence reads fine.
        setAmbiguousCorrections(
          processedText && source === 'local' ? localBest?.substitutions ?? [] : []
        );
        setRecognitionSource(processedText ? source : null);
        setEngineDisagreement(disagreement);
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

  /**
   * Ask Gemini to solve the current question. Used automatically when local
   * evaluation fails on a genuinely complex question (complexity gate) and
   * manually via the "Ask Gemini" button.
   */
  const askGeminiSolve = async (question: string): Promise<boolean> => {
    if (!geminiEnabled) return false;
    setGeminiBusy(true);
    setError(null);
    setResult(null);
    setSolvedByGemini(false);
    try {
      const solved = await solveWithGemini(question.trim().slice(0, 500));
      if (solved.answer === null) {
        setError('Gemini could not determine a numeric answer for this question — edit the expression or re-scan.');
        setResult(null);
        setSolvedByGemini(false);
        return false;
      }
      setResult(solved.answer);
      setError(null);
      setSolvedByGemini(true);
      return true;
    } catch (err) {
      setError(
        err instanceof GeminiUnavailableError
          ? err.message
          : 'Gemini solving is unavailable right now.'
      );
      setResult(null);
      setSolvedByGemini(false);
      return false;
    } finally {
      setGeminiBusy(false);
    }
  };

  const handleSolve = () => {
    // Word questions must never reach the arithmetic cleaner: it strips the
    // words and silently turns "what is 15% of 350" into 15*350 = 5250.
    // A question with actual word content always goes to Gemini when the
    // server supports it, and fails loudly with an explanation when not.
    if (findUnknownWord(recognizedText.trim())) {
      if (geminiEnabled) {
        void askGeminiSolve(recognizedText);
      } else {
        setError(
          'This looks like a word question. Word math needs Google Gemini, which is not available from this server — retype the numbers as an expression.'
        );
        setResult(null);
      }
      return;
    }

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

    setSolvedByGemini(false);
    try {
      const evalResult = evaluateExpression(expression);
      if (evalResult.success) {
        setResult(evalResult.result as string);
        setError(null);
      } else {
        const localError = evalResult.error || 'Invalid expression';
        // Complexity-activated Gemini solving: only genuinely hard questions
        // (word problems, long/deep expressions) cost a model call. A simple
        // misread digit stays a manual correction, exactly as before.
        const complexity = assessComplexity(expression, true);
        if (geminiEnabled && complexity.complex) {
          void askGeminiSolve(expression);
        } else if (geminiEnabled && !complexity.complex) {
          setError(localError);
        } else {
          setError(localError);
        }
        if (!geminiEnabled) setResult(null);
      }
    } catch (err) {
      setError('Failed to evaluate expression');
      setResult(null);
    }
  };

  const handleApplyNewImage = (imageDataUrl: string) => {
    setCapturedImage(imageDataUrl);
    // A new image invalidates any previous recognition result
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);
    setAmbiguousCorrections([]);
    setGeminiMessage(null);
    setRecognitionSource(null);
    setEngineDisagreement(false);
    setSolvedByGemini(false);
    setGeminiVerified(false);
    setGeminiMessage(null);
    setRecognitionSource(null);
    setEngineDisagreement(false);
    setSolvedByGemini(false);
    setGeminiVerified(false);
    setHasScanned(false);
  };

  const handleCropApply = (croppedDataUrl: string) => {
    setShowCropEditor(false);
    handleApplyNewImage(croppedDataUrl);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setHasScanned(false);
    setAmbiguousCorrections([]);
    setShowCamera(true);
  };

  /** Rotate the captured image 90° clockwise (plan Phase 6: rotation). */
  const handleRotate = async () => {
    if (!capturedImage || isRotating) return;
    setIsRotating(true);
    try {
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
      const rotated = rotateCanvas90(canvas, 1);
      const dataUrl = typeof rotated.toDataURL === 'function' ? rotated.toDataURL('image/png') : '';
      if (!dataUrl) throw new Error('Failed to encode the rotated image');
      handleApplyNewImage(dataUrl);
    } catch (err) {
      console.error('Rotation failed:', err);
      setError('Failed to rotate the image. Retake or re-upload it, or crop to the expression instead.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleReset = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);
    setAmbiguousCorrections([]);
    setGeminiMessage(null);
    setRecognitionSource(null);
    setEngineDisagreement(false);
    setSolvedByGemini(false);
    setGeminiVerified(false);
    setHasScanned(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-0 space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Scan Calculator
          </h2>
          <span
            data-testid="scan-engine-badge"
            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
              geminiEnabled === true
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : geminiEnabled === false
                ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                : 'animate-pulse bg-gray-100 text-gray-400 dark:bg-gray-800'
            }`}
          >
            {geminiEnabled === true
              ? '✨ Powered by Google Gemini'
              : geminiEnabled === false
              ? 'Local recognition only'
              : 'Checking engines…'}
          </span>
        </div>

        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-200">
            {geminiEnabled === true ? (
              <>
                ✨ Lens-style scanning: your photo is cross-examined by Google Gemini against the
                local OCR reading, so misread digits and operators (÷, ×, O→0) are corrected
                automatically. Complex questions are solved by Gemini. When offline, recognition
                runs locally.
              </>
            ) : (
              <>
                ℹ️ Scanner: Supports printed arithmetic and simple expressions. Handwriting,
                fractions, and advanced equations are not supported.
              </>
            )}
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
                  onClick={handleRotate}
                  disabled={isRotating}
                  className="p-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  aria-label="Rotate image 90 degrees clockwise"
                  title="Rotate image 90° clockwise"
                >
                  ⟳
                </button>
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
                  setAmbiguousCorrections([]);
                  setSolvedByGemini(false);
                  setEngineDisagreement(false);
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
              {recognitionSource === 'gemini' && !engineDisagreement && (
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-purple-600 dark:text-purple-300" data-testid="recognition-source">
                  ✨ Cross-validated by Google Gemini
                </p>
              )}
              {recognitionSource === 'gemini' && engineDisagreement && (
                <p role="status" className="mt-1 sm:mt-2 text-xs sm:text-sm text-amber-600 dark:text-amber-400" data-testid="recognition-source">
                  ⚠️ Gemini and the local OCR engine read this differently — please verify the
                  expression above before solving.
                </p>
              )}
              {recognitionSource === 'gemini' && !geminiVerified && (
                <p role="status" className="mt-1 sm:mt-2 text-xs sm:text-sm text-amber-600 dark:text-amber-400" data-testid="gemini-verified">
                  ⚠️ Reading not independently verified — check each digit before solving.
                </p>
              )}
              {geminiEnabled === true && recognitionSource !== 'gemini' && recognitionSource !== null && (
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400" data-testid="recognition-source">
                  📷 Recognized locally (offline mode)
                </p>
              )}
              {geminiMessage && (
                <p role="status" className="mt-1 sm:mt-2 text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                  {geminiMessage}
                </p>
              )}
              {ambiguousCorrections.length > 0 && (
                <p
                  role="status"
                  className="mt-1 sm:mt-2 text-xs sm:text-sm text-orange-600 dark:text-orange-400"
                >
                  ⚠️ Ambiguous characters were auto-corrected: {ambiguousCorrections.join(', ')} — please
                  verify them before solving.
                </p>
              )}
            </div>

            <button
              onClick={handleSolve}
              disabled={geminiBusy}
              className="w-full p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              {geminiBusy ? '🤖 Solving with Gemini…' : 'Solve Expression'}
            </button>
            {geminiEnabled === true && recognizedText && (
              <button
                onClick={() => void askGeminiSolve(cleanForEvaluation(recognizedText) || recognizedText)}
                disabled={geminiBusy}
                data-testid="ask-gemini"
                className="w-full p-3 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg font-medium hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                🤖 Solve this with Google Gemini
              </button>
            )}
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm sm:text-base">Result</h4>
            <div className="text-xl sm:text-2xl font-mono text-green-700 dark:text-green-400" data-testid="scan-result">
              {result}
            </div>
            {solvedByGemini && (
              <p className="mt-2 text-xs sm:text-sm text-purple-600 dark:text-purple-300">
                ✨ Computed by Google Gemini (complex question beyond local evaluation)
              </p>
            )}
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
