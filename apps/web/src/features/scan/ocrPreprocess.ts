/**
 * OCR Image Preprocessing Functions
 * Pure functions that operate on canvas or ImageData
 *
 * Strategy: keep images GRAYSCALE with normalized contrast rather than
 * hard-binarizing. Tesseract's LSTM engine reads grayscale far more reliably
 * than a 1-bit image, especially under uneven lighting.
 *
 * Safety: every canvas this module creates is size-capped. Mobile browsers
 * (notably iOS Safari, ~16.7MP) silently produce a blank canvas when the limit
 * is exceeded, which makes OCR return nothing.
 */

export interface ScaleOptions {
  /** Height (px) text is scaled to when it falls outside [minInkHeight, maxInkHeight]. */
  targetInkHeight?: number;
  /** Text shorter than this is scaled up. */
  minInkHeight?: number;
  /** Text taller than this is scaled down. */
  maxInkHeight?: number;
  minScale?: number;
  maxScale?: number;
  /** Hard cap on the longest side of the output. */
  maxSide?: number;
  /** Hard cap on total output pixels. */
  maxPixels?: number;
}

/** Inputs larger than this are downscaled before any per-pixel work. */
export const OCR_INPUT_MAX_SIDE = 2400;

const DEFAULT_SCALE_OPTIONS: Required<ScaleOptions> = {
  targetInkHeight: 60,
  minInkHeight: 40,
  maxInkHeight: 120,
  minScale: 0.5,
  maxScale: 4,
  maxSide: 3000,
  maxPixels: 6000000,
};

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
 * Calculate Otsu's threshold (expects a grayscale image).
 * Maximizes between-class variance using cumulative pixel counts.
 */
export function otsuThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(data[i])]++;
  }

  const total = data.length / 4;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;

    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;

    const variance = weightB * weightF * (meanB - meanF) ** 2;
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
 * Stretch contrast so the darkest `lowPercentile` maps to 0 and the brightest
 * `highPercentile` maps to 255.
 *
 * The defaults clip only 0.2% at each end. A wider clip (the old 2%) assumes
 * at least 2% of the pixels are ink; on thin digits over a large white area it
 * clips shadows on the paper to solid black.
 */
export function contrastStretch(
  imageData: ImageData,
  lowPercentile: number = 0.002,
  highPercentile: number = 0.998
): ImageData {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const total = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(data[i])]++;
  }

  const lowCount = total * lowPercentile;
  const highCount = total * highPercentile;
  let cumulative = 0;
  let low = 0;
  let high = 255;
  let lowFound = false;
  let highFound = false;

  for (let t = 0; t < 256; t++) {
    cumulative += histogram[t];
    if (!lowFound && cumulative >= lowCount) {
      low = t;
      lowFound = true;
    }
    if (!highFound && cumulative >= highCount) {
      high = t;
      highFound = true;
      break;
    }
  }

  const range = high - low;
  if (range <= 0) return imageData;

  // Build lookup table for speed
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.min(255, Math.max(0, ((v - low) / range) * 255));
  }

  for (let i = 0; i < data.length; i += 4) {
    const v = lut[Math.round(data[i])];
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  return imageData;
}

/**
 * Invert when the page background is dark (light text on a dark screen).
 *
 * Uses the MEDIAN brightness instead of the mean: the background is the
 * majority of pixels, so the median follows it. A mean skews dark on tight
 * crops of large, bold digits and inverts them by mistake.
 */
export function invertIfDark(imageData: ImageData): ImageData {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const total = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(data[i])]++;
  }

  let cumulative = 0;
  let median = 0;
  for (let t = 0; t < 256; t++) {
    cumulative += histogram[t];
    if (cumulative >= total / 2) {
      median = t;
      break;
    }
  }

  if (median < 128) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  return imageData;
}

/**
 * Per-pixel ink mask for a grayscale, dark-on-light image.
 *
 * A pixel is ink when it is clearly darker than the paper AROUND it (the 90th
 * percentile brightness of its local block). Unlike a single global threshold
 * (Otsu), this still finds thin digits when one side of the photo is in shadow:
 * with ink covering ~1% of pixels, Otsu splits the shaded and lit paper instead
 * of ink vs. paper.
 *
 * Returns null when there is no ink, or ink is not the minority class.
 */
export function computeInkMask(imageData: ImageData): { mask: Uint8Array; count: number } | null {
  const { data, width, height } = imageData;
  if (width === 0 || height === 0) return null;

  const block = Math.min(96, Math.max(24, Math.round(Math.min(width, height) / 4)));
  const blocksX = Math.ceil(width / block);
  const blocksY = Math.ceil(height / block);
  const paper = new Uint8Array(blocksX * blocksY);
  const hist = new Uint32Array(256);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      hist.fill(0);
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(width, x0 + block);
      const y1 = Math.min(height, y0 + block);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[data[(y * width + x) * 4]]++;
        }
      }
      const target = (x1 - x0) * (y1 - y0) * 0.9;
      let cumulative = 0;
      let level = 255;
      for (let t = 0; t < 256; t++) {
        cumulative += hist[t];
        if (cumulative >= target) {
          level = t;
          break;
        }
      }
      paper[by * blocksX + bx] = level;
    }
  }

  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y++) {
    const rowBlock = Math.floor(y / block) * blocksX;
    for (let x = 0; x < width; x++) {
      const level = paper[rowBlock + Math.floor(x / block)];
      const v = data[(y * width + x) * 4];
      if (level - v >= 34 && v < level * 0.78) {
        mask[y * width + x] = 1;
        count++;
      }
    }
  }

  if (count === 0 || count / (width * height) > 0.5) return null;
  return { mask, count };
}

/**
 * Estimate the height (px) of one line of text in a grayscale, dark-on-light
 * image. Returns null when it cannot tell (blank, flat, or mostly-dark image).
 *
 * Consecutive rows that contain ink form a "band" (one text line); the median
 * band height is used so multi-line input and stray specks do not skew it.
 */
export function estimateInkHeight(imageData: ImageData): number | null {
  const ink = computeInkMask(imageData);
  if (!ink) return null;

  const { width, height } = imageData;
  const minInkPerRow = Math.max(2, Math.floor(width * 0.002));
  const bands: number[] = [];
  let run = 0;

  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) count += ink.mask[rowStart + x];
    if (count >= minInkPerRow) {
      run++;
    } else if (run > 0) {
      bands.push(run);
      run = 0;
    }
  }
  if (run > 0) bands.push(run);
  if (bands.length === 0) return null;

  const substantial = bands.filter((b) => b >= 3);
  const pool = (substantial.length > 0 ? substantial : bands).sort((a, b) => a - b);
  return pool[Math.floor(pool.length / 2)];
}

/**
 * Decide how much to scale an image so text height lands in a range Tesseract
 * reads well, while never exceeding the hard size caps. Pure, so it can be
 * unit tested.
 */
export function computeOCRScale(imageData: ImageData, options: ScaleOptions = {}): number {
  const opts = { ...DEFAULT_SCALE_OPTIONS, ...options };
  const { width, height } = imageData;
  if (width === 0 || height === 0) return 1;

  // Text between minInkHeight and maxInkHeight is left alone: resampling it
  // (especially downscaling) can erase thin strokes such as the bar of a "+".
  const inkHeight = estimateInkHeight(imageData);
  let scale = 1;
  if (inkHeight && (inkHeight < opts.minInkHeight || inkHeight > opts.maxInkHeight)) {
    scale = opts.targetInkHeight / inkHeight;
  }
  scale = Math.min(opts.maxScale, Math.max(opts.minScale, scale));

  // Hard caps always win over the preferred scale.
  scale = Math.min(scale, opts.maxSide / Math.max(width, height));
  scale = Math.min(scale, Math.sqrt(opts.maxPixels / (width * height)));

  return scale;
}

function resizeCanvas(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  newCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  const newCtx = newCanvas.getContext('2d');
  if (!newCtx) return canvas;
  newCtx.imageSmoothingEnabled = true;
  newCtx.imageSmoothingQuality = 'high';
  newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
  return newCanvas;
}

/**
 * Scale the canvas when its text is clearly too small or too large (see
 * `computeOCRScale`). Scales up OR down, and never exceeds the size caps.
 */
export function scaleForOCR(
  canvas: HTMLCanvasElement,
  targetInkHeight: number = DEFAULT_SCALE_OPTIONS.targetInkHeight,
  options: ScaleOptions = {}
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scale = computeOCRScale(imageData, { ...options, targetInkHeight });

  if (Math.abs(scale - 1) < 0.05) return canvas;
  return resizeCanvas(canvas, scale);
}

/**
 * @deprecated Kept for compatibility. The old implementation mistook the gap
 * between ink rows for text height and could request a 32x upscale (a canvas
 * large enough to fail silently on mobile). Now delegates to `scaleForOCR`.
 */
export function upscaleToTargetHeight(canvas: HTMLCanvasElement, targetHeight: number = 60): HTMLCanvasElement {
  return scaleForOCR(canvas, targetHeight);
}

export interface InkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of the text in a grayscale, dark-on-light image, padded by half
 * a line height. Returns null when there is nothing to crop to: blank/flat
 * image, ink is not the minority, or the box already covers most of the image.
 *
 * Single-line OCR fails when a small expression floats in a large page (a
 * photo of a whole screen), so cropping to the text makes uncropped captures
 * work. Rows/columns need a few ink pixels to count, so isolated specks do not
 * stretch the box.
 */
export function findInkBounds(imageData: ImageData): InkBounds | null {
  const ink = computeInkMask(imageData);
  if (!ink) return null;

  const { width, height } = imageData;
  const rowInk = new Uint32Array(height);
  const colInk = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink.mask[y * width + x]) {
        rowInk[y]++;
        colInk[x]++;
      }
    }
  }

  const minRow = Math.max(2, Math.floor(width * 0.002));
  const minCol = Math.max(2, Math.floor(height * 0.002));
  let top = -1;
  let bottom = -1;
  let left = -1;
  let right = -1;
  for (let y = 0; y < height; y++) {
    if (rowInk[y] >= minRow) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  for (let x = 0; x < width; x++) {
    if (colInk[x] >= minCol) {
      if (left < 0) left = x;
      right = x;
    }
  }
  if (top < 0 || left < 0) return null;

  const pad = Math.max(8, Math.round((bottom - top + 1) * 0.5));
  const x0 = Math.max(0, left - pad);
  const y0 = Math.max(0, top - pad);
  const x1 = Math.min(width, right + 1 + pad);
  const y1 = Math.min(height, bottom + 1 + pad);

  const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // Not worth cropping if it would keep (nearly) the whole image
  if (box.width * box.height > width * height * 0.7) return null;
  return box;
}

/**
 * Crop a canvas to the region containing text (no-op when not applicable).
 */
export function cropToInk(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;

  const bounds = findInkBounds(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) return canvas;

  const out = document.createElement('canvas');
  out.width = bounds.width;
  out.height = bounds.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas;
  outCtx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return out;
}

/**
 * Downscale a canvas whose longest side exceeds `maxSide` (no-op otherwise).
 */
export function limitCanvasSize(canvas: HTMLCanvasElement, maxSide: number = OCR_INPUT_MAX_SIDE): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= maxSide) return canvas;
  return resizeCanvas(canvas, maxSide / longest);
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
 * Apply full preprocessing pipeline (OCR-friendly). Does not modify the input.
 *
 * Order matters:
 *  1. cap the input size so per-pixel work stays fast and memory-safe,
 *  2. grayscale removes color noise (screen subpixel fringes),
 *  3. invertIfDark handles light-on-dark captures (dark-mode screens),
 *  4. crop to the text region so a small expression in a big photo still reads
 *     as a single line,
 *  5. contrast stretch AFTER cropping: on a whole photo the text is a tiny
 *     share of the pixels, so percentile clipping lands inside the paper's
 *     brightness range and amplifies sensor noise instead of enhancing text,
 *  6. rescale only if the text is clearly too small/large, within hard size caps,
 *  7. white border is added last so it stays white and never skews measurements.
 *
 * Deliberately skips hard binarization to protect accuracy.
 * Output should be exported as PNG (lossless), never JPEG.
 */
export function preprocessForOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (canvas.width === 0 || canvas.height === 0) return canvas;

  const sized = limitCanvasSize(canvas, OCR_INPUT_MAX_SIDE);

  // Work on a copy so the caller's canvas is never mutated
  const work = document.createElement('canvas');
  work.width = sized.width;
  work.height = sized.height;
  const ctx = work.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(sized, 0, 0);

  let imageData = ctx.getImageData(0, 0, work.width, work.height);
  imageData = grayscale(imageData);
  imageData = invertIfDark(imageData);
  ctx.putImageData(imageData, 0, 0);

  const cropped = cropToInk(work);

  const cropCtx = cropped.getContext('2d');
  if (cropCtx) {
    const stretched = contrastStretch(cropCtx.getImageData(0, 0, cropped.width, cropped.height));
    cropCtx.putImageData(stretched, 0, 0);
  }

  // Scale BEFORE adding the border: a bright border skews the local paper
  // estimate in edge blocks and makes shaded paper look like ink.
  const scaled = scaleForOCR(cropped, DEFAULT_SCALE_OPTIONS.targetInkHeight);
  return addWhiteBorder(scaled, 16);
}
