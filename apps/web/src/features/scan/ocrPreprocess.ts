/**
 * OCR Image Preprocessing Functions
 * Pure functions that operate on canvas or ImageData
 *
 * Strategy: keep images GRAYSCALE with normalized contrast rather than
 * hard-binarizing. Tesseract's LSTM engine reads grayscale far more reliably
 * than a 1-bit image, especially under uneven lighting. Hard Otsu thresholding
 * (the previous approach) erases thin digit strokes and amplifies JPEG noise.
 */

/**
 * Convert image to grayscale
 */
export function grayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  return imageData;
}

/**
 * Calculate Otsu's threshold for adaptive thresholding
 */
function otsuThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);

  // Build histogram
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  // Total pixels
  const total = data.length / 4;

  // Calculate cumulative sum and cumulative mean
  let sum = 0;
  let sumB = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
    const wB = sum / total;
    if (wB === 0) continue;

    const wF = 1 - wB;
    if (wF === 0) continue;

    sumB += histogram[t];
    const mB = sumB / wB;

    // Calculate between-class variance
    const variance = wB * wF * (mB - sumB / wF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Apply global thresholding using Otsu's method.
 * Retained for callers/tests that need a binary image; NOT used in the
 * default OCR pipeline because it hurts LSTM accuracy on photos.
 */
export function adaptiveThreshold(imageData: ImageData): ImageData {
  const threshold = otsuThreshold(imageData);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i];
    const value = gray > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  return imageData;
}

/**
 * Stretch contrast so the darkest 2% maps to 0 and the brightest 2% maps to 255.
 * This is a lightweight stand-in for CLAHE and makes faint digits readable
 * without discarding grayscale detail the way binarization does.
 */
export function contrastStretch(imageData: ImageData): ImageData {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const total = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  // Find 2nd and 98th percentile cut points
  const lowCount = total * 0.02;
  const highCount = total * 0.98;
  let cumulative = 0;
  let low = 0;
  let high = 255;
  let lowFound = false;

  for (let t = 0; t < 256; t++) {
    cumulative += histogram[t];
    if (!lowFound && cumulative >= lowCount) {
      low = t;
      lowFound = true;
    }
    if (cumulative >= highCount) {
      high = t;
      break;
    }
  }

  const range = high - low;
  if (range <= 0) return imageData;

  // Build lookup table for speed
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const stretched = ((v - low) / range) * 255;
    lut[v] = Math.min(255, Math.max(0, stretched));
  }

  for (let i = 0; i < data.length; i += 4) {
    const v = lut[data[i]];
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  return imageData;
}

/**
 * Check if image is mostly dark and invert if needed
 */
export function invertIfDark(imageData: ImageData): ImageData {
  const data = imageData.data;
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    sum += data[i];
  }

  const avg = sum / (data.length / 4);

  // If average brightness is below 128, invert
  if (avg < 128) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  return imageData;
}

/**
 * Upscale image to make text height approximately 32px
 * Estimate text height from the image and scale accordingly
 */
export function upscaleToTargetHeight(canvas: HTMLCanvasElement, targetHeight: number = 32): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Estimate text height by finding horizontal lines
  const height = canvas.height;
  const width = canvas.width;
  const lineHeights: number[] = [];

  for (let y = 0; y < height; y++) {
    let hasDarkPixel = false;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < 128) {
        hasDarkPixel = true;
        break;
      }
    }
    if (hasDarkPixel) {
      lineHeights.push(y);
    }
  }

  // Estimate text height from consecutive lines
  let maxGap = 0;
  for (let i = 1; i < lineHeights.length; i++) {
    const gap = lineHeights[i] - lineHeights[i - 1];
    if (gap > maxGap && gap < 50) {
      maxGap = gap;
    }
  }

  const currentTextHeight = maxGap || height / 10;
  const scaleFactor = targetHeight / currentTextHeight;

  if (scaleFactor > 1) {
    const newWidth = Math.round(canvas.width * scaleFactor);
    const newHeight = Math.round(canvas.height * scaleFactor);
    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    const newCtx = newCanvas.getContext('2d');

    if (newCtx) {
      newCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
    }

    return newCanvas;
  }

  return canvas;
}

/**
 * Add white border to image
 */
export function addWhiteBorder(canvas: HTMLCanvasElement, borderSize: number = 16): HTMLCanvasElement {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = canvas.width + borderSize * 2;
  newCanvas.height = canvas.height + borderSize * 2;
  const ctx = newCanvas.getContext('2d');

  if (ctx) {
    // Fill with white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
    // Draw original image in center
    ctx.drawImage(canvas, borderSize, borderSize);
  }

  return newCanvas;
}

/**
 * Apply full preprocessing pipeline (OCR-friendly).
 *
 * Order matters:
 *  1. white border isolates content from the canvas edge,
 *  2. grayscale removes color noise,
 *  3. contrast stretch normalizes faint text WITHOUT destroying strokes,
 *  4. invertIfDark handles light-on-dark captures,
 *  5. upscale keeps glyphs near Tesseract's preferred ~32px height.
 *
 * Deliberately skips hard binarization (adaptiveThreshold) to protect accuracy.
 * Output should be exported as PNG (lossless), never JPEG.
 */
export function preprocessForOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  // Add white border first
  let processedCanvas = addWhiteBorder(canvas, 16);

  // Get image data
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) return canvas;

  let imageData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);

  // Apply grayscale
  imageData = grayscale(imageData);

  // Apply gentle contrast stretch (replaces hard thresholding)
  imageData = contrastStretch(imageData);

  // Invert if dark
  imageData = invertIfDark(imageData);

  // Put back
  ctx.putImageData(imageData, 0, 0);

  // Upscale to target height
  processedCanvas = upscaleToTargetHeight(processedCanvas, 32);

  return processedCanvas;
}
