import { useRef, useState } from 'react';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CropEditorProps {
  imageSrc: string;
  onApply: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

/**
 * Crop editor for an already-captured or uploaded image.
 * Uses pointer events so it works with mouse, touch, and pen.
 * Applies the crop via canvas and returns a lossless PNG data URL.
 */
export function CropEditor({ imageSrc, onApply, onCancel }: CropEditorProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert a pointer event to coordinates clamped to the displayed image.
  const getPoint = (e: React.PointerEvent) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const p = getPoint(e);
    if (!p) return;
    // setPointerCapture can throw if the pointer is no longer active.
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore — drag still works without capture
    }
    dragStartRef.current = { x: p.x, y: p.y };
    setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const p = getPoint(e);
    if (!p) return;
    const s = dragStartRef.current;
    setCrop({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const applyCrop = () => {
    const img = imgRef.current;
    // Ignore accidental clicks with no meaningful selection
    if (!img || !crop || crop.w < 5 || crop.h < 5) {
      onCancel();
      return;
    }

    // Map displayed coordinates back to natural image pixels
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const sx = Math.round(crop.x * scaleX);
    const sy = Math.round(crop.y * scaleY);
    const sw = Math.max(1, Math.round(crop.w * scaleX));
    const sh = Math.max(1, Math.round(crop.h * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onCancel();
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    // Lossless PNG preserves crisp digit edges for OCR
    onApply(canvas.toDataURL('image/png'));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 max-w-2xl w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Crop to the expression
        </h3>

        <div className="relative inline-block max-w-full touch-none select-none">
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop preview"
            className="max-w-full max-h-[60vh] block rounded pointer-events-none"
            draggable={false}
          />
          {/* Drawing layer */}
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {crop && crop.w > 0 && crop.h > 0 && (
            <div
              className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            />
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Drag over the expression to select it. Cropping focuses the OCR and improves accuracy.
        </p>

        <div className="flex gap-3 mt-4">
          <button
            onClick={applyCrop}
            className="flex-1 p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Apply Crop
          </button>
          <button
            onClick={onCancel}
            className="flex-1 p-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
