export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Apply grayscale and contrast stretch to canvas for better OCR
 * This is optional and can be skipped if it doesn't improve accuracy
 */
export function preprocessForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  // Contrast stretch
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const range = max - min;
  if (range > 0) {
    for (let i = 0; i < data.length; i += 4) {
      const val = data[i];
      const stretched = ((val - min) / range) * 255;
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Capture video frame to dataURL with cropping and scaling
 * @param video - Video element to capture from
 * @param cropRect - Rectangle to crop from (null for full frame)
 * @param maxSize - Maximum dimension (width or height) for the output
 * @returns DataURL of the captured image
 */
export function captureToDataUrl(
  video: HTMLVideoElement,
  cropRect: CropRect | null = null,
  maxSize: number = 1600
): string {
  // Determine source dimensions
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;

  if (cropRect) {
    sourceX = cropRect.x;
    sourceY = cropRect.y;
    sourceWidth = cropRect.width;
    sourceHeight = cropRect.height;
  }

  // Calculate output dimensions (maintain aspect ratio, cap at maxSize)
  const aspectRatio = sourceWidth / sourceHeight;
  let outputWidth = sourceWidth;
  let outputHeight = sourceHeight;

  if (outputWidth > maxSize || outputHeight > maxSize) {
    if (aspectRatio > 1) {
      outputWidth = maxSize;
      outputHeight = maxSize / aspectRatio;
    } else {
      outputHeight = maxSize;
      outputWidth = maxSize * aspectRatio;
    }
  }

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Draw video frame to canvas with scaling
  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Optional: Apply preprocessing for OCR
  // preprocessForOcr(canvas);

  // Export as JPEG at 0.9 quality
  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Calculate crop rectangle for guide frame
 * @param videoWidth - Video element width
 * @param videoHeight - Video element height
 * @param guideWidth - Guide frame width (pixels)
 * @param guideHeight - Guide frame height (pixels)
 * @returns Crop rectangle in video coordinates
 */
export function calculateCropRect(
  videoWidth: number,
  videoHeight: number,
  guideWidth: number,
  guideHeight: number
): CropRect {
  const videoRatio = videoWidth / videoHeight;
  const guideRatio = guideWidth / guideHeight;

  let displayWidth, displayHeight;

  if (videoRatio > guideRatio) {
    displayHeight = videoHeight;
    displayWidth = videoHeight * guideRatio;
  } else {
    displayWidth = videoWidth;
    displayHeight = videoWidth / guideRatio;
  }

  const x = (videoWidth - displayWidth) / 2;
  const y = (videoHeight - displayHeight) / 2;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(displayWidth),
    height: Math.round(displayHeight)
  };
}
