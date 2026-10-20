import { useState } from 'react';
import { evaluateExpression } from '@calculator-suite/math-core';
import Tesseract from 'tesseract.js';

export function ScanCalculator() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleCapture = async () => {
    // Placeholder for camera capture
    // In a full implementation, this would use getUserMedia API
    alert('Camera capture would be implemented here with getUserMedia API');
  };

  const handleRecognize = async () => {
    if (!capturedImage) {
      setError('Please capture or upload an image first');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Use Tesseract.js for OCR recognition
      const { data } = await Tesseract.recognize(capturedImage, 'eng', {
        logger: (m) => console.log(m),
      });

      setRecognizedText(data.text.trim());
      setConfidence(data.confidence);
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
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Scan Calculator
        </h2>

        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            ℹ️ Scanner v1: Supports printed arithmetic and simple expressions. Handwriting, fractions, and advanced equations are not supported.
          </p>
        </div>

        {/* Image Input Section */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <button
              onClick={handleCapture}
              className="flex-1 p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              📷 Capture Camera
            </button>
            <label className="flex-1">
              <span className="block w-full p-4 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center cursor-pointer">
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
                className="w-full max-h-64 object-contain rounded-lg border border-gray-300 dark:border-gray-600"
              />
              <button
                onClick={handleReset}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                aria-label="Clear image"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* OCR Section */}
        {capturedImage && (
          <div className="mb-6">
            <button
              onClick={handleRecognize}
              disabled={isProcessing}
              className="w-full p-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : '🔍 Recognize Text'}
            </button>
          </div>
        )}

        {/* Recognized Text Section */}
        {recognizedText && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recognized Expression (Edit if needed)
              </label>
              <textarea
                value={recognizedText}
                onChange={(e) => setRecognizedText(e.target.value)}
                className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                rows={3}
                placeholder="Recognized expression will appear here"
              />
              {confidence !== null && (
                <div className="mt-2 text-sm">
                  <span className={`font-medium ${confidence < 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                    Confidence: {confidence.toFixed(2)}%
                  </span>
                  {confidence < 70 && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                      ⚠️ Low confidence - please verify
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSolve}
              className="w-full p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Solve Expression
            </button>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Result</h4>
            <div className="text-2xl font-mono text-green-700 dark:text-green-400">
              {result}
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Error</h4>
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Offline Message */}
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ℹ️ OCR requires an active internet connection for the first load. Offline mode will be available after the OCR library is cached.
          </p>
        </div>
      </div>
    </div>
  );
}
