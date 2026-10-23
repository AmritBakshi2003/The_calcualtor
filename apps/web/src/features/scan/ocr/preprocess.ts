/**
 * Phase-1 OCR variants: three enhanced versions of the cropped scan that are
 * each recognized separately (PSM 7 and PSM 13), with the best reading chosen
 * downstream in `recognize.ts`.
 *
 * The existing `ocrPreprocess.ts` produces ONE grayscale image and deliberately
 * avoids binarization because Otsu hurts LSTM accuracy on photos. Both things
 * stay true for the primary path; the binarized variants exist because
 * thresholds win in specific conditions (Otsu on clean high-contrast prints,
 * Sauvola on unevenly lit paper where a global threshold kills thin strokes),
 * and ranking by score picks whichever variant actually read best.
 *
 * Every canvas this module creates is size-capped the same way as
 * `ocrPreprocess` (mobile browsers silently blank oversized canvases).
 * The pixel transforms are pure (ImageData in/out) and unit tested; only
 * `buildVariants` touches the DOM.
 */

import {
  addWhiteBorder,
  computeOCRScale,
  grayscale,
  invertIfDark,
  otsuThreshold,
} from '../ocrPreprocess';

export type OcrVariantName = 'grayscale' | 'otsu' | 'sauvola';

export interface OcrVariant {
  name: OcrVariantName;
  canvas: HTMLCanvasElement;
}

/** Middle of the requested 30-40px character-height band. */
export const VARIANT_TARGET_INK_HEIGHT = 36;
/** White margin around every variant (spec: 20 px). */
export const VARIANT_BORDER = 20;

/** Hard caps shared with ocrPreprocess defaults (maxSide 3000, 6MP). */
const VARIANT_SCALE_OPTIONS = {
  targetInkHeight: VARIANT_TARGET_INK_HEIGHT,
  minInkHeight: 30,
  maxInkHeight: 40,
  minScale: 0.5,
  maxScale: 4,
};

export interface SauvolaOptions {
  /** Side of the square local window in px; odd values avoid a centre bias. */
  window?: number;
  /** Sensitivity: higher -> more pixels counted as ink. Sauvola default 0.2. */
  k?: number;
  /** Dynamic range of the standard deviation (128 for 8-bit grayscale). */
  r?: number;
}

const DEFAULT_SAUVOLA: Required<SauvolaOptions> = { window: 31, k: 0.2, r: 128 };

/**
 * Sauvola local thresholding: each pixel is compared against
 * `T = mean * (1 + k * (std / R - 1))` computed over its window.
 *
 * Unlike Otsu's single global cut, the threshold follows the local paper
 * brightness, so thin dark digits survive next to a shadow the global
 * threshold would swallow. Mean and variance come from summed-area tables,
 * so the cost is O(pixels) regardless of window size.
 *
 * Expects a grayscale, dark-on-light image; mutates and returns it.
 */
export function sauvolaThreshold(imageData: ImageData, options: SauvolaOptions = {}): ImageData {
  const { data, width, height } = imageData;
  if (width === 0 || height === 0) return imageData;

  const opts = { ...DEFAULT_SAUVOLA, ...options };
  const half = Math.max(1, Math.floor(opts.window / 2));

  // Integral image (row 0 / column 0 unused) of gray values and their squares.
  const sum = new Float64Array((width + 1) * (height + 1));
  const sumSq = new Float64Array((width + 1) * (height + 1));
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < width; x++) {
      const g = data[(y * width + x) * 4];
      gray[y * width + x] = g;
      rowSum += g;
      rowSumSq += g * g;
      const i = (y + 1) * (width + 1) + (x + 1);
      sum[i] = sum[i - 1] + rowSum;
      sumSq[i] = sumSq[i - 1] + rowSumSq;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const tl = y0 * (width + 1) + x0;
      const tr = y0 * (width + 1) + x1 + 1;
      const bl = (y1 + 1) * (width + 1) + x0;
      const br = (y1 + 1) * (width + 1) + x1 + 1;
      const s = sum[br] - sum[tr] - sum[bl] + sum[tl];
      const s2 = sumSq[br] - sumSq[tr] - sumSq[bl] + sumSq[tl];
      const mean = s / area;
      const variance = Math.max(0, s2 / area - mean * mean);
      const std = Math.sqrt(variance);
      const threshold = mean * (1 + opts.k * (std / opts.r - 1));
      const i = (y * width + x) * 4;
      const value = gray[y * width + x] <= threshold ? 0 : 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

  return imageData;
}

/**
 * Light denoise: one 3x3 median pass. Removes isolated specks and sensor
 * noise (a lone dark pixel in a white neighbourhood becomes white) while
 * keeping glyph edges, which a mean filter would blur. Mutates and returns
 * the image.
 */
export function medianDenoise(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  if (width === 0 || height === 0) return imageData;

  const gray = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) gray[p] = data[i];

  const window = new Uint8Array(9);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          window[n++] = gray[ny * width + nx];
        }
      }
      const sorted = Array.from(window.slice(0, n)).sort((a, b) => a - b);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = sorted[n >> 1];
    }
  }

  return imageData;
}

/**
 * Scale a variant so one text line is `targetInkHeight` px tall (30-40px
 * band), within the shared hard caps. Delegates the measurement and clamping
 * to `computeOCRScale` from ocrPreprocess; returns the original canvas when
 * no rescaling is needed (no ink, or already in the band).
 */
function scaleToInkHeight(canvas: HTMLCanvasElement, targetInkHeight: number): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scale = computeOCRScale(imageData, { ...VARIANT_SCALE_OPTIONS, targetInkHeight });
  if (Math.abs(scale - 1) < 0.05) return canvas;

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** Build a variant canvas from pixel data (image -> canvas -> rescale). */
function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Build the three Phase-1 variants from an already-cropped image (the output
 * of `preprocessForOCR` — grayscale, deskewed, contrast-normalized).
 *
 * Per variant, in order:
 *  1. pixel transform (grayscale re-applied / Otsu / Sauvola),
 *  2. upscale so characters are ~36px tall (inside the 30-40px band),
 *  3. 20px white border,
 *  4. one light 3x3 median denoise pass.
 *
 * The denoise runs last so it also cleans the just-rescaled image, and the
 * uniform white border is unaffected by a median over a white neighbourhood.
 * Returns [] when canvas access is unavailable (tests, workers).
 */
export function buildVariants(source: HTMLCanvasElement, border: number = VARIANT_BORDER): OcrVariant[] {
  const ctx = source.getContext('2d');
  if (!ctx || source.width === 0 || source.height === 0) return [];

  const base = ctx.getImageData(0, 0, source.width, source.height);
  const clone = () => new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);

  const transforms: { name: OcrVariantName; transform: (image: ImageData) => ImageData }[] = [
    { name: 'grayscale', transform: (image) => grayscale(invertIfDark(image)) },
    { name: 'otsu', transform: (image) => {
      const grayImage = grayscale(image);
      const threshold = otsuThreshold(grayImage);
      const data = grayImage.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i] > threshold ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
      }
      return grayImage;
    } },
    { name: 'sauvola', transform: (image) => sauvolaThreshold(grayscale(image)) },
  ];

  const variants: OcrVariant[] = [];
  for (const { name, transform } of transforms) {
    const canvas = imageDataToCanvas(transform(clone()));
    if (!canvas) continue;
    const scaled = scaleToInkHeight(canvas, VARIANT_TARGET_INK_HEIGHT);
    const bordered = addWhiteBorder(scaled, border);
    const borderCtx = bordered.getContext('2d');
    if (borderCtx) {
      borderCtx.putImageData(medianDenoise(borderCtx.getImageData(0, 0, bordered.width, bordered.height)), 0, 0);
    }
    variants.push({ name, canvas: bordered });
  }

  return variants;
}
