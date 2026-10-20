import { useEffect, useRef, useState } from 'react';
import { useCamera } from './useCamera';
import { captureToDataUrl, calculateCropRect } from './imageUtils';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageData: string) => void;
}

export function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
  const {
    stream,
    error,
    isLoading,
    hasMultipleCameras,
    hasTorch,
    isTorchOn,
    startCamera,
    stopCamera,
    switchCamera,
    toggleTorch
  } = useCamera();

  const videoRef = useRef<HTMLVideoElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showCropMode, setShowCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Start camera when overlay opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  // Set video stream when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Focus management
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showCropMode) {
          setShowCropMode(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showCropMode]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleCapture = async () => {
    if (!videoRef.current || !stream || isCapturing) return;

    setIsCapturing(true);
    setShowFlash(true);

    // Brief flash animation
    setTimeout(() => setShowFlash(false), 150);

    try {
      if (showCropMode && cropRect.width > 0 && cropRect.height > 0) {
        // Use custom crop
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        const scaleX = videoWidth / (videoRef.current.offsetWidth || videoWidth);
        const scaleY = videoHeight / (videoRef.current.offsetHeight || videoHeight);

        const scaledCrop = {
          x: cropRect.x * scaleX,
          y: cropRect.y * scaleY,
          width: cropRect.width * scaleX,
          height: cropRect.height * scaleY
        };

        const imageData = captureToDataUrl(videoRef.current, scaledCrop, 1600);
        onCapture(imageData);
      } else {
        // Use default center crop (80% of frame)
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        const defaultCrop = calculateCropRect(videoWidth, videoHeight, videoWidth * 0.8, videoHeight * 0.8);

        const imageData = captureToDataUrl(videoRef.current, defaultCrop, 1600);
        onCapture(imageData);
      }
      onClose();
    } catch (err) {
      console.error('Failed to capture image:', err);
    } finally {
      setIsCapturing(false);
      setShowCropMode(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragStart({ x, y });
    setCropRect({ x, y, width: 0, height: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = x - dragStart.x;
    const height = y - dragStart.y;

    setCropRect({
      x: width < 0 ? x : dragStart.x,
      y: height < 0 ? y : dragStart.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const toggleCropMode = () => {
    setShowCropMode(!showCropMode);
    if (!showCropMode) {
      // Reset crop rect when entering crop mode
      setCropRect({ x: 0, y: 0, width: 0, height: 0 });
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleSwitchCamera = async () => {
    await switchCamera();
  };

  const handleToggleTorch = async () => {
    await toggleTorch();
  };

  const handleFallbackUpload = () => {
    stopCamera();
    onClose();
    // Trigger file input fallback
    const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera capture"
      className="fixed inset-0 z-50 bg-black h-[100dvh]"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)'
      }}
    >
      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Camera Error
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {error.message}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleFallbackUpload}
                className="w-full p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Upload image instead
              </button>
              <button
                onClick={handleClose}
                className="w-full p-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-white text-center">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm">Starting camera...</p>
          </div>
        </div>
      )}

      {/* Video Preview */}
      {stream && !error && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Shutter Flash */}
          {showFlash && (
            <div className="absolute inset-0 bg-white animate-pulse" />
          )}

          {/* Guide Frame Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-white/50 border-dashed w-[80%] h-[80%] rounded-lg relative">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-white text-xs bg-black/50 px-2 py-1 rounded">
                Align the expression inside the box
              </div>
            </div>
          </div>

          {/* Top Controls */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
            {hasMultipleCameras && (
              <button
                onClick={handleSwitchCamera}
                className="p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                aria-label="Switch camera"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            <button
              onClick={toggleCropMode}
              className={`p-3 rounded-full transition-colors ${
                showCropMode ? 'bg-blue-500 text-white' : 'bg-black/50 text-white hover:bg-black/70'
              }`}
              aria-label={showCropMode ? 'Exit crop mode' : 'Enter crop mode'}
              title={showCropMode ? 'Exit crop mode' : 'Crop image'}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </button>

            {hasTorch && (
              <button
                onClick={handleToggleTorch}
                className={`p-3 rounded-full transition-colors ${
                  isTorchOn ? 'bg-yellow-500 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                }`}
                aria-label={isTorchOn ? 'Turn off torch' : 'Turn on torch'}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>
            )}

            <button
              ref={closeButtonRef}
              onClick={handleClose}
              className="p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              aria-label="Close camera"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Crop Overlay */}
          {showCropMode && (
            <div
              ref={containerRef}
              className="absolute inset-0 cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {cropRect.width > 0 && cropRect.height > 0 && (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/20"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height
                  }}
                />
              )}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
                Drag to select crop area
              </div>
            </div>
          )}

          {/* Guide Frame Overlay (only when not in crop mode) */}
          {!showCropMode && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/50 border-dashed w-[80%] h-[80%] rounded-lg relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-white text-xs bg-black/50 px-2 py-1 rounded">
                  Align the expression inside the box
                </div>
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center items-center pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={handleCapture}
              disabled={isCapturing}
              className="w-[72px] h-[72px] bg-white rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              aria-label="Capture photo"
            >
              <div className="w-14 h-14 border-4 border-gray-900 rounded-full" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
