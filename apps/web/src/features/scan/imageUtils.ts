export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Build a real ImageData when the runtime provides it (jsdom does not). */
function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  const ImageDataCtor = (globalThis as { ImageData?: typeof ImageData }).ImageData;
  if (ImageDataCtor) {
    // `as never` bypasses the DOM lib's narrow Uint8ClampedArray<ArrayBuffer>
    // generic requirement without changing the runtime value.
    return new ImageDataCtor(data as never, width, height) as ImageData;
  }
  return { data, width, height } as unknown as ImageData;
}

/**
 * Rotate ImageData 90° clockwise. Pure pixel permutation over the source data,
 * so it is unit testable without a canvas implementation.
 */
export function rotateImageData90cw(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const outWidth = height;
  // A 90° clockwise rotation sends source pixel (x, y) to (height-1-y, x).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = (x * outWidth + (height - 1 - y)) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return makeImageData(out, outWidth, width);
}

/**
 * Rotate a canvas by `turns` 90° clockwise quarter-turns (plan Phase 6:
 * rotation). Never mutates the input; returns the same canvas unchanged when
 * there is nothing to rotate or the environment cannot access pixel data
 * (jsdom tests have no canvas implementation).
 */
export function rotateCanvas90(canvas: HTMLCanvasElement, turns: number = 1): HTMLCanvasElement {
  if (canvas.width === 0 || canvas.height === 0) return canvas;
  const quarterTurns = ((turns % 4) + 4) % 4;
  if (quarterTurns === 0) return canvas;

  let current = canvas;
  for (let i = 0; i < quarterTurns; i++) {
    const ctx = current.getContext('2d');
    if (
      !ctx ||
      typeof ctx.getImageData !== 'function' ||
      typeof ctx.putImageData !== 'function'
    ) {
      return current;
    }
    let source: ImageData;
    try {
      source = ctx.getImageData(0, 0, current.width, current.height);
    } catch {
      // Cross-origin canvases throw; leave the image untouched.
      return current;
    }
    const rotated = rotateImageData90cw(source);

    const out = document.createElement('canvas');
    out.width = rotated.width;
    out.height = rotated.height;
    const outCtx = out.getContext('2d');
    if (!outCtx || typeof outCtx.putImageData !== 'function') return current;
    outCtx.putImageData(rotated, 0, 0);
    current = out;
  }
  return current;
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
