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
  solveWithGemini,
} from './geminiClient';
import { assessComplexity, findUnknownWord } from './complexity';
import {
  applyStageEvent,
  applyStageEvents,
  initialStages,
  serverStagesToEvents,
  type ScanStage,
  type StageId,
  type StageState,
} from './scanStages';
import { StageList } from './StageList';
import {
  ocrSpaceMessage,
  requestConsensus,
  requestOcrSpace,
  type ConsensusClientResult,
} from './scanEngineClient';

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
  // True once a recognition attempt has finished (even an empty or failed one),
  // so the edit box stays available for typing the expression manually.
  const [hasScanned, setHasScanned] = useState(false);
  // Same-origin Gemini API availability (null = probe still running).
  const [geminiEnabled, setGeminiEnabled] = useState<boolean | null>(null);
  // Phase-4 progress: pipeline stages + the consensus verdict.
  const [stages, setStages] = useState<ScanStage[]>(initialStages);
  // Verification state from the consensus route (null = not scanned / unavailable).
  const [scanMeta, setScanMeta] = useState<{
    verified: boolean | null;
    sources: string[];
    alternatives: string[];
    /** Symbols dropped during cleanup; non-empty forces the warning line. */
    dropped: string[];
  } | null>(null);
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
    setSolvedByGemini(false);
    setStages(initialStages());
    setScanMeta(null);
  };

  /** Emit one pipeline stage event (Phase 4 progress UI). */
  const emitStage = (stage: StageId, state: StageState, detail?: string) =>
    setStages((prev) => applyStageEvent(prev, { stage, state, detail }));

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

  /** Consensus source label -> a short engine name for the chip row. */
  const friendlyEngine = (source: string): string => {
    const head = source.split(':')[0];
    if (head === 'tesseract') return 'Tesseract';
    if (head === 'ocrspace') return 'OCR.space';
    if (head === 'gemini') return 'Gemini';
    return source;
  };

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
    dropped: candidate.dropped,
  });

  /**
   * Recognize via the Phase-1 pipeline: three preprocessing variants
   * (grayscale, Otsu, Sauvola), each read with PSM 7 and PSM 13 under the
   * LSTM engine and the scan whitelist — at most 6 recognitions per scan —
   * then normalize, score and rank the readings. Returns the best candidate
   * for the local fallback AND the full candidate list for the consensus
   * route (each variant is a distinct source there).
   */
  const runRecognition = async (
    preprocessedCanvas: HTMLCanvasElement
  ): Promise<{ best: OcrCandidate | null; scanCandidates: ScanCandidate[] }> => {
    const scanCandidates = await recognizeScanCandidates(preprocessedCanvas, getWorker);
    return { best: pickBestCandidate(scanCandidates.map(toComponentCandidate)), scanCandidates };
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
    emitStage('prepare', 'running');

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
      emitStage('prepare', 'done');

      // Tesseract variant passes (Phase 1 pipeline, max 6 recognitions).
      emitStage('tesseract', 'running');
      let recognition = await runRecognition(preprocessedCanvas);

      // An engine stuck in a bad state — an outdated cached worker.min.js, or
      // a half-downloaded language file — returns nothing usable WITHOUT
      // throwing, so the user just sees a stray character. Discarding the
      // worker and running the passes once more recovers automatically.
      if (!recognition.best?.expression) {
        await terminateWorker();
        recognition = await runRecognition(preprocessedCanvas);
      }
      const localBest = recognition.best;
      emitStage(
        'tesseract',
        localBest?.expression ? 'done' : 'failed',
        localBest?.expression ? undefined : 'nothing readable'
      );

      // OCR.space — a soft engine: every failure degrades to a plain message.
      emitStage('ocrspace', 'running');
      const ocrspaceCandidates: { expression: string; source: string }[] = [];
      try {
        const ocr = await requestOcrSpace(preprocessedCanvas.toDataURL('image/png'));
        if (ocr.available && ocr.expression) {
          emitStage('ocrspace', 'done', `read by engine ${ocr.engine ?? 2}`);
          ocrspaceCandidates.push({ expression: ocr.expression, source: 'ocrspace' });
        } else if (ocr.available) {
          emitStage('ocrspace', 'skipped', 'no text found');
        } else {
          emitStage('ocrspace', 'skipped', ocrSpaceMessage(ocr.reason));
        }
      } catch {
        emitStage('ocrspace', 'failed', 'OCR.space is unreachable.');
      }

      // Consensus: server-side cache, decide() and (only if needed) the
      // protected Gemini arbiter. The server answers in one response, so the
      // server-side rows are mapped from its stage trace.
      emitStage('cache', 'running');
      emitStage('compare', 'running');
      let consensus: ConsensusClientResult | null = null;
      try {
        consensus = await requestConsensus(
          preprocessedCanvas.toDataURL('image/png'),
          [
            ...recognition.scanCandidates.map((candidate) => ({
              expression: candidate.expression,
              confidence: candidate.confidence,
              source: `tesseract:${candidate.variant}-psm${candidate.psm}`,
              // Cleanups that dropped symbols must not look verified:
              // "2+3¤5" -> "2+35" silently changes the value.
              dropped: candidate.dropped.length > 0 ? candidate.dropped : undefined,
            })),
            ...ocrspaceCandidates,
          ]
        );
        setStages((prev) => applyStageEvents(prev, serverStagesToEvents(consensus!.stages)));
      } catch {
        emitStage('cache', 'failed', 'unreachable');
        emitStage('compare', 'failed', 'The comparison service is unreachable.');
        emitStage('gemini', 'skipped', 'not available');
        // Without the consensus verdict the local reading ships unverified.
        setScanMeta({ verified: false, sources: [], alternatives: [], dropped: [] });
      }

      // The consensus expression wins when the server produced one; the
      // local reading stands when the consensus service is unavailable.
      const processedText = consensus?.expression
        ? consensus.expression
        : localBest
        ? toExpression(localBest.expression)
        : '';

      if (consensus) {
        // Warn about the text actually SHOWN: the server's reading when it
        // produced one (these are marked unverified by the server), the local
        // candidate's otherwise ("2+3¤5" became "2+35" locally).
        // A dropped character silently can change the value, so it never
        // ships as verified either way.
        const dropped = consensus.expression?.length
          ? (consensus.dropped ?? [])
          : (localBest?.dropped ?? []);
        setScanMeta({
          verified: consensus.verified && dropped.length === 0,
          sources: consensus.sources,
          alternatives: consensus.alternatives,
          dropped,
        });
      }

      // A per-character confidence only exists for a purely local reading
      // (the consensus route does not report symbol confidences).
      const confidenceKnown = consensus ? false : (localBest?.confidenceKnown ?? false);
      const lowCount = confidenceKnown ? lowConfidenceSymbolCount(localBest?.segment) : 0;
      setLowConfidenceIndices(Array.from({ length: lowCount }, (_, i) => i));

      if (!editedWhileProcessingRef.current) {
        setRecognizedText(processedText);
        // A confidence score is meaningless when nothing was read.
        setConfidence(processedText && confidenceKnown ? localBest?.confidence ?? null : null);
      }

      emitStage(
        'final',
        processedText ? 'done' : 'failed',
        processedText ? undefined : 'nothing readable'
      );

      if (!processedText) {
        setError(
          'Nothing readable was found. The scanner engine has been reloaded — press Recognize Text to try again, crop closer to the expression, or type it below.'
        );
      }
    } catch (err) {
      console.error('OCR failed:', err);
      emitStage('final', 'failed', 'recognition failed');
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
    setSolvedByGemini(false);
    setStages(initialStages());
    setScanMeta(null);
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
    setStages(initialStages());
    setScanMeta(null);
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
    setSolvedByGemini(false);
    setStages(initialStages());
    setScanMeta(null);
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
            {stages.some((stage) => stage.state !== 'pending') && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg">
                <StageList stages={stages} />
              </div>
            )}
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
                  setSolvedByGemini(false);
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
              {/* Phase 4: verification verdict, engine sources, alternatives. */}
              {scanMeta && (
                <div className="mt-2 space-y-2 text-xs sm:text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      data-testid="verification-badge"
                      role="status"
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        scanMeta.verified
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                    >
                      {scanMeta.verified ? '✓ Verified' : '⚠ Unverified — please check'}
                    </span>
                    {scanMeta.sources.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1" data-testid="engine-sources">
                        <span className="text-gray-500 dark:text-gray-400">Engines:</span>
                        {scanMeta.sources.map((source) => (
                          <span
                            key={source}
                            className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                          >
                            {friendlyEngine(source)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {scanMeta.dropped.length > 0 && (
                    <p data-testid="dropped-symbols" role="alert" className="text-amber-600 dark:text-amber-400">
                      Some symbols were not recognized: {scanMeta.dropped.join(', ')}
                    </p>
                  )}
                  {!scanMeta.verified && scanMeta.alternatives.length > 0 && (
                    <div data-testid="alternatives" className="flex flex-wrap items-center gap-1.5">
                      <span className="text-gray-500 dark:text-gray-400">Other readings — tap to use:</span>
                      {scanMeta.alternatives.map((alternative) => (
                        <button
                          key={alternative}
                          type="button"
                          onClick={() => {
                            // Choosing an alternative is the user's tap-to-confirm:
                            // it fills the box; solving still needs its own tap.
                            setRecognizedText(alternative);
                            setResult(null);
                            setError(null);
                          }}
                          className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-600"
                        >
                          {alternative}
                        </button>
                      ))}
                    </div>
                  )}
                  {scanMeta.verified === false && (
                    <p role="status" className="text-amber-600 dark:text-amber-400">
                      This reading was not confirmed by two engines. Check the digits, pick another
                      reading above, or solve anyway — nothing is solved automatically.
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSolve}
              disabled={geminiBusy}
              className="w-full p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              {geminiBusy
                ? '🤖 Solving with Gemini…'
                : scanMeta?.verified === false
                ? 'Solve anyway (unverified)'
                : 'Solve Expression'}
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
