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
 * Median horizontal ink-run length inside text bands, divided by the median
 * band height: how thin the strokes are relative to the text size. Thin
 * (regular / monospace) weights resample into broken strokes that Tesseract
 * reads as wrong digits ("123+456" -> "131156", "100-1" -> "160-1").
 * Pure; returns null when there is no text to measure.
 */
export function strokeWidthRatio(imageData: ImageData): number | null {
  const ink = computeInkMask(imageData);
  if (!ink) return null;

  const { width, height } = imageData;
  const minInkPerRow = Math.max(2, Math.floor(width * 0.002));

  // Text bands, same rule as estimateInkHeight.
  const inBand = new Uint8Array(height);
  const bandHeights: number[] = [];
  let run = 0;
  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) count += ink.mask[rowStart + x];
    if (count >= minInkPerRow) {
      inBand[y] = 1;
      run++;
    } else if (run > 0) {
      bandHeights.push(run);
      run = 0;
    }
  }
  if (run > 0) bandHeights.push(run);

  const substantial = bandHeights.filter((b) => b >= 3);
  const heights = (substantial.length > 0 ? substantial : bandHeights).sort((a, b) => a - b);
  if (heights.length === 0) return null;
  const bandHeight = heights[Math.floor(heights.length / 2)];

  // Median horizontal ink run across those band rows.
  const runs: number[] = [];
  for (let y = 0; y < height; y++) {
    if (!inBand[y]) continue;
    const rowStart = y * width;
    let x = 0;
    while (x < width) {
      if (ink.mask[rowStart + x]) {
        let len = 1;
        while (x + len < width && ink.mask[rowStart + x + len]) len++;
        runs.push(len);
        x += len;
      } else {
        x++;
      }
    }
  }
  if (runs.length === 0) return null;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)] / bandHeight;
}

/**
 * Darken strokes by one pixel: a 3x3 minimum filter on dark-on-light
 * grayscale (low value = ink, so the minimum expands ink outward). One pass
 * only — enough to carry a 1-2px anti-aliased stroke through resampling
 * without merging neighbouring glyphs. Mutates and returns the image.
 */
export function thickenStrokes(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) gray[p] = data[i];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const v = gray[ny * width + nx];
          if (v < min) min = v;
        }
      }
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = min;
    }
  }
  return imageData;
}

/**
 * Stroke ratio below which the text counts as "thin" and gets the thickening
 * treatment. Measured on screen-photo-like input: Roboto Bold renders at
 * 0.20-0.23 while Roboto Mono and Open Sans render at 0.12-0.16, so 0.16
 * separates the thin families from bold without touching bold text.
 */
export const THIN_STROKE_RATIO = 0.16;

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

export interface SkewOptions {
  /** Angles beyond ±this are ignored; text is never scanned upside down. */
  maxAngle?: number;
}

/**
 * Estimate how far the text is rotated, in degrees. Positive means the ink
 * lines DESCEND to the right (the page was rotated clockwise on the photo).
 *
 * Uses the ink mask's shifted row projections: for candidate angle `a`, ink
 * pixel (x, y) is counted in row-bin `y + (x - cx) * tan(a)`. When `a` equals
 * the true skew, each text line collapses into one concentrated bin, which
 * maximises the sum of squared bin counts. A coarse pass over whole degrees
 * finds the ballpark, a fine pass refines it. Sub-samples large images so the
 * estimate stays cheap.
 *
 * Pure over ImageData so it is unit testable. Returns 0 when there is no ink.
 */
export function estimateSkewAngle(imageData: ImageData, options: SkewOptions = {}): number {
  const maxAngle = options.maxAngle ?? 15;
  const ink = computeInkMask(imageData);
  if (!ink) return 0;

  const { width, height } = imageData;
  if (width === 0 || height === 0) return 0;
  const cx = (width - 1) / 2;

  // Sub-sample ink coordinates so the projection loop stays fast on big photos.
  const coords: number[] = [];
  const stride = Math.max(1, Math.ceil(ink.count / 200000));
  let seen = 0;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (ink.mask[rowStart + x]) {
        seen++;
        if (seen % stride === 0) coords.push(x, y);
      }
    }
  }
  const pointCount = coords.length / 2;
  if (pointCount === 0) return 0;

  const binCount = height + Math.ceil(width) + 2;
  const projectionScore = (angleDeg: number): number => {
    const tan = Math.tan((angleDeg * Math.PI) / 180);
    const bins = new Float64Array(binCount);
    for (let i = 0; i < coords.length; i += 2) {
      // y grows downward; ink at y = yc + k·(x-cx) concentrates when a = θ,
      // so a positive result really does mean "descends to the right".
      const bin = Math.round(coords[i + 1] - (coords[i] - cx) * tan);
      if (bin >= 0 && bin < binCount) bins[bin]++;
    }
    let score = 0;
    for (let b = 0; b < binCount; b++) score += bins[b] * bins[b];
    return score;
  };

  let best = 0;
  let bestScore = projectionScore(0);
  for (let angle = -maxAngle; angle <= maxAngle + 1e-9; angle += 1) {
    if (angle === 0) continue;
    const score = projectionScore(angle);
    if (score > bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  // Refine ±1° in quarter-degree steps around the coarse winner (skip 0 —
  // projectionScore(0) is already the benchmark for "no skew").
  if (best !== 0) {
    for (let angle = best - 1; angle <= best + 1 + 1e-9; angle += 0.25) {
      if (Math.abs(angle) < 1e-9) continue;
      const score = projectionScore(angle);
      if (score > bestScore) {
        bestScore = score;
        best = angle;
      }
    }
  }
  return best;
}

export interface DeskewResult {
  canvas: HTMLCanvasElement;
  /** Detected skew in degrees (see `estimateSkewAngle`). */
  angle: number;
  /** True when the canvas was re-drawn to cancel the skew. */
  corrected: boolean;
}

/**
 * Straighten a slightly rotated canvas (plan Phase 6: optional deskewing).
 * Angles under one degree would blur glyphs more than they fix, so they are
 * left alone. Never mutates the input canvas; degrades to the original canvas
 * when canvas access is unavailable (tests, worker-less environments).
 */
export function deskewCanvas(
  canvas: HTMLCanvasElement,
  options: SkewOptions & { threshold?: number } = {}
): DeskewResult {
  if (canvas.width === 0 || canvas.height === 0) return { canvas, angle: 0, corrected: false };
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.getImageData !== 'function') return { canvas, angle: 0, corrected: false };

  const angle = estimateSkewAngle(ctx.getImageData(0, 0, canvas.width, canvas.height), options);
  if (Math.abs(angle) < (options.threshold ?? 1)) return { canvas, angle, corrected: false };

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext('2d');
  if (!outCtx || typeof outCtx.rotate !== 'function') return { canvas, angle, corrected: false };

  // White fill behind the rotation: crop-to-ink later needs paper, not
  // transparency, to find the text bounds.
  outCtx.fillStyle = 'white';
  outCtx.fillRect(0, 0, out.width, out.height);
  // Ink descends to the right by `angle` degrees (positive); rotating the
  // canvas counter-clockwise (negative canvas angle) straightens it.
  outCtx.save();
  outCtx.translate(out.width / 2, out.height / 2);
  outCtx.rotate((-angle * Math.PI) / 180);
  outCtx.drawImage(canvas, -out.width / 2, -out.height / 2);
  outCtx.restore();
  return { canvas: out, angle, corrected: true };
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
 *  4. deskew so later crop/measurements see straight text lines,
 *  5. crop to the text region so a small expression in a big photo still reads
 *     as a single line,
 *  6. contrast stretch AFTER cropping: on a whole photo the text is a tiny
 *     share of the pixels, so percentile clipping lands inside the paper's
 *     brightness range and amplifies sensor noise instead of enhancing text,
 *  7. rescale only if the text is clearly too small/large, within hard size caps,
 *  8. white border is added last so it stays white and never skews measurements.
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

  // Deskew BEFORE cropping: crop-to-ink is computed from the ink mask, so a
  // skewed page would have its diagonal text box already cut off at the
  // canvas edges before any later stage could straighten it. Under one degree
  // is left alone (deskewCanvas decides), so straight captures are untouched.
  const straightened = deskewCanvas(work);

  const cropped = cropToInk(straightened.canvas);

  const cropCtx = cropped.getContext('2d');
  if (cropCtx) {
    const stretched = contrastStretch(cropCtx.getImageData(0, 0, cropped.width, cropped.height));
    // Thin strokes get one minimum-filter pass BEFORE scaling: resampling a
    // 1-2px anti-aliased stroke breaks it into fragments Tesseract reads as
    // wrong digits. Bold text (ratio above THIN_STROKE_RATIO) is untouched.
    const ratio = strokeWidthRatio(stretched);
    const thinned = ratio !== null && ratio < THIN_STROKE_RATIO;
    cropCtx.putImageData(thinned ? thickenStrokes(stretched) : stretched, 0, 0);
  }

  // Scale BEFORE adding the border: a bright border skews the local paper
  // estimate in edge blocks and makes shaded paper look like ink.
  const scaled = scaleForOCR(cropped, DEFAULT_SCALE_OPTIONS.targetInkHeight);
  return addWhiteBorder(scaled, 16);
}
