import { useState, useRef, useEffect } from 'react';
import { evaluateExpression } from '@calculator-suite/math-core';
import Tesseract from 'tesseract.js';
import { CameraCapture } from './CameraCapture';
import { useOCRWorker } from './useOCRWorker';
import { preprocessForOCR } from './ocrPreprocess';
import { postprocessOCR, getCharConfidences, findLowConfidenceIndices } from './ocrPostprocess';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getWorker } = useOCRWorker();

  // Store worker reference for cleanup
  const workerRef = useRef<Tesseract.Worker | null>(null);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
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
    setShowCamera(true);
  };

  const performOCR = async (imageData: string, useSingleBlock = false): Promise<Tesseract.RecognizeResult> => {
    const worker = await getWorker();
    workerRef.current = worker;

    // Update PSM mode if retrying with single block
    if (useSingleBlock) {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      });
    }

    const result = await worker.recognize(imageData);

    // Reset to single line for next time
    if (useSingleBlock) {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      });
    }

    return result;
  };

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
      await new Promise((resolve) => {
        img.onload = resolve;
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
      const preprocessedImageData = preprocessedCanvas.toDataURL('image/jpeg', 0.9);

      // First OCR pass
      let result = await performOCR(preprocessedImageData);
      let processedText = postprocessOCR(result.data.text.trim());

      // Check if we need retry (low confidence or doesn't parse)
      const confidence = result.data.confidence || 0;
      const evalResult = evaluateExpression(processedText);

      if (confidence < 70 || !evalResult.success) {
        // Retry with single block mode
        const retryResult = await performOCR(preprocessedImageData, true);
        const retryText = postprocessOCR(retryResult.data.text.trim());
        const retryEval = evaluateExpression(retryText);

        // Pick the best result (prefer one that parses)
        if (retryEval.success && !evalResult.success) {
          result = retryResult;
          processedText = retryText;
        } else if (retryEval.success && evalResult.success) {
          // Both parse, pick higher confidence
          if (retryResult.data.confidence > result.data.confidence) {
            result = retryResult;
            processedText = retryText;
          }
        }
      }

      // Get character-level confidences for highlighting
      const charConfidences = getCharConfidences(result);
      const lowIndices = findLowConfidenceIndices(charConfidences, 60);
      setLowConfidenceIndices(lowIndices);

      setRecognizedText(processedText);
      setConfidence(result.data.confidence || 0);
      setIsProcessing(false);
    } catch (err) {
      setError('Failed to recognize text from image');
      setIsProcessing(false);
    }
  };

  const handleSolve = () => {
    if (!recognizedText) {
      setError('No expression to solve');
      return;
    }

    try {
      const evalResult = evaluateExpression(recognizedText);
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

  const handleReset = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setConfidence(null);
    setResult(null);
    setError(null);
    setBlurWarning(false);
    setLowConfidenceIndices([]);
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
        {recognizedText && (
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Recognized Expression (Edit if needed)
              </label>
              <textarea
                value={recognizedText}
                onChange={(e) => setRecognizedText(e.target.value)}
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
