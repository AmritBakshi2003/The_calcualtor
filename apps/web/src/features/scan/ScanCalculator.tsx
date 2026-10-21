import { useState, useRef } from 'react';
import { evaluateExpression } from '@calculator-suite/math-core';
import Tesseract from 'tesseract.js';
import { CameraCapture } from './CameraCapture';
import { CropEditor } from './CropEditor';
import { useOCRWorker, OCR_DEFAULT_PARAMS } from './useOCRWorker';
import { preprocessForOCR } from './ocrPreprocess';
import { postprocessOCR, cleanForEvaluation, getKeptSymbolConfidences, findLowConfidenceIndices } from './ocrPostprocess';
import { isBlurry } from './blurDetection';

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
  const { getWorker } = useOCRWorker();

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
    /** Pass '' to disable the character whitelist for this pass only. */
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

  const handleRecognize = async () => {
    if (!capturedImage) {
      setError('Please capture or upload an image first');
      return;
    }

    setIsProcessing(true);
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
      // PNG (lossless) preserves crisp digit edges; JPEG artifacts degrade OCR.
      const preprocessedImageData = preprocessedCanvas.toDataURL('image/png');

      // First OCR pass
      let result = await performOCR(preprocessedImageData);
      let processedText = toExpression(result.data.text);

      // Check if we need retry (low confidence or doesn't parse)
      const confidence = result.data.confidence || 0;
      let evalResult = evaluateExpression(processedText);

      if (confidence < 70 || !evalResult.success) {
        // Retry with single block mode
        const retryResult = await performOCR(preprocessedImageData, { psm: Tesseract.PSM.SINGLE_BLOCK });
        const retryText = toExpression(retryResult.data.text);
        const retryEval = evaluateExpression(retryText);

        // Pick the best result (prefer one that parses)
        if (retryEval.success && !evalResult.success) {
          result = retryResult;
          processedText = retryText;
          evalResult = retryEval;
        } else if (retryEval.success && evalResult.success) {
          // Both parse, pick higher confidence
          if (retryResult.data.confidence > result.data.confidence) {
            result = retryResult;
            processedText = retryText;
            evalResult = retryEval;
          }
        }
      }

      // Last resort: the whitelist forces unreadable glyphs into the nearest
      // allowed character (often a wrong digit). If nothing parsed yet, read
      // once more without it and let postprocessing map look-alike letters.
      if (!evalResult.success) {
        const openResult = await performOCR(preprocessedImageData, { whitelist: '' });
        const openText = toExpression(openResult.data.text);
        if (evaluateExpression(openText).success) {
          result = openResult;
          processedText = openText;
        }
      }

      // Character-level confidences (only symbols that survive postprocessing)
      const charConfidences = getKeptSymbolConfidences(result);
      const lowIndices = findLowConfidenceIndices(charConfidences, 60);
      setLowConfidenceIndices(lowIndices);

      setRecognizedText(processedText);
      setConfidence(result.data.confidence || 0);

      if (!processedText) {
        setError('No text detected. Type the expression below, crop closer to it, or retake the photo.');
      }
    } catch (err) {
      console.error('OCR failed:', err);
      setError('Failed to recognize text from image. You can type the expression below instead.');
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
                  setRecognizedText(e.target.value);
                  setResult(null);
                  setError(null);
                  setLowConfidenceIndices([]);
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full p-3 sm:p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs sm:text-sm"
                rows={3}
                placeholder="Recognized expression will appear here"
              />
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
