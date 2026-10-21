import { describe, it, expect } from 'vitest';
import {
  adaptiveThreshold,
  computeOCRScale,
  contrastStretch,
  estimateInkHeight,
  findInkBounds,
  invertIfDark,
  otsuThreshold,
} from './ocrPreprocess';

/** Build a grayscale ImageData from a per-pixel function. */
function makeImage(width: number, height: number, pixel: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
}

/** True for pixels that form "strokes" (50% duty cycle), like glyphs rather than a solid slab. */
const stroke = (x: number) => x % 6 < 3;

/** Light page with a dark, stroke-like text band covering rows [top, top + inkHeight). */
function textLine(width: number, height: number, top: number, inkHeight: number): ImageData {
  return makeImage(width, height, (x, y) =>
    y >= top && y < top + inkHeight && x > 10 && x < width - 10 && stroke(x) ? 20 : 240
  );
}

describe('otsuThreshold', () => {
  it('separates a bimodal image between the two modes', () => {
    const img = makeImage(10, 10, (x) => (x < 3 ? 30 : 220));
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it('adaptiveThreshold produces a clean binary split', () => {
    const img = adaptiveThreshold(makeImage(10, 10, (x) => (x < 3 ? 30 : 220)));
    expect(img.data[0]).toBe(0);
    expect(img.data[9 * 4]).toBe(255);
  });
});

describe('estimateInkHeight', () => {
  it('measures the height of a single text line', () => {
    expect(estimateInkHeight(textLine(300, 100, 30, 24))).toBe(24);
  });

  it('uses the median band height for multi-line text', () => {
    const img = makeImage(300, 200, (x, y) => {
      const inLine1 = y >= 20 && y < 44;
      const inLine2 = y >= 80 && y < 104;
      const inSpeck = y >= 150 && y < 151;
      return (inLine1 || inLine2 || inSpeck) && x > 10 && x < 290 && stroke(x) ? 20 : 240;
    });
    expect(estimateInkHeight(img)).toBe(24);
  });

  it('returns null for a blank image and for a mostly-dark one', () => {
    expect(estimateInkHeight(makeImage(50, 50, () => 255))).toBeNull();
    expect(estimateInkHeight(makeImage(50, 50, () => 10))).toBeNull();
  });
});

describe('computeOCRScale', () => {
  it('scales clearly-too-small text up to the target height', () => {
    const scale = computeOCRScale(textLine(300, 100, 30, 20));
    expect(scale).toBeCloseTo(3, 5); // 20px -> 60px
  });

  it('leaves comfortably sized text alone (resampling can erase thin strokes like "+")', () => {
    expect(computeOCRScale(textLine(300, 120, 20, 65))).toBe(1);
    expect(computeOCRScale(textLine(300, 120, 20, 45))).toBe(1);
  });

  it('scales oversized text down (but not below the minimum scale)', () => {
    const scale = computeOCRScale(textLine(800, 400, 50, 200));
    expect(scale).toBeCloseTo(0.5, 5); // 200px -> would be 0.3, clamped to 0.5
  });

  // Regression: the old estimator treated the 1px gap between ink rows as the
  // text height and asked for a 32x upscale, creating canvases mobile browsers
  // cannot allocate (OCR then received a blank image).
  it('never requests an absurd upscale when ink fills every row', () => {
    const photoOfScreen = makeImage(1600, 1200, (x, y) => ((x + y) % 7 === 0 ? 20 : 235));
    const scale = computeOCRScale(photoOfScreen);
    expect(scale).toBeLessThanOrEqual(4);
    expect(1600 * scale * 1200 * scale).toBeLessThanOrEqual(6000000 + 1);
  });

  it('keeps the output under the pixel and side caps for large inputs', () => {
    const big = makeImage(2400, 1800, (x, y) => (y % 50 < 20 && x > 100 && stroke(x) ? 20 : 240));
    const scale = computeOCRScale(big, { minInkHeight: 5, maxInkHeight: 10, targetInkHeight: 200 });
    expect(Math.max(2400, 1800) * scale).toBeLessThanOrEqual(3000 + 1);
    expect(2400 * scale * 1800 * scale).toBeLessThanOrEqual(6000000 + 1);
  });

  it('returns 1 when the ink height cannot be estimated and caps are not hit', () => {
    expect(computeOCRScale(makeImage(100, 50, () => 255))).toBe(1);
  });
});

describe('findInkBounds', () => {
  it('finds a small expression inside a large page', () => {
    // 1200x900 page, 90px tall text spanning x 500..700 at y 400..490
    const img = makeImage(1200, 900, (x, y) => (y >= 400 && y < 490 && x >= 500 && x < 700 && stroke(x) ? 20 : 240));
    const box = findInkBounds(img)!;
    expect(box).not.toBeNull();
    expect(box.x).toBeLessThanOrEqual(500);
    expect(box.x + box.width).toBeGreaterThanOrEqual(700);
    expect(box.y).toBeLessThanOrEqual(400);
    expect(box.y + box.height).toBeGreaterThanOrEqual(490);
    expect(box.width * box.height).toBeLessThan(1200 * 900 * 0.2);
  });

  // Regression: a global (Otsu) threshold split the shaded and lit halves of the
  // paper instead of ink vs. paper, so photos with a shadow were never cropped.
  it('still finds the text when one side of the photo is in shadow', () => {
    const img = makeImage(1200, 900, (x, y) => {
      const paper = 245 - Math.round(70 * (1 - x / 1200)); // 175 on the left -> 245 on the right
      const ink = y >= 400 && y < 490 && x >= 500 && x < 700 && stroke(x);
      return ink ? 30 : paper;
    });
    const box = findInkBounds(img);
    expect(box).not.toBeNull();
    expect(box!.width * box!.height).toBeLessThan(1200 * 900 * 0.2);
  });

  it('returns null for blank pages and when text already fills the image', () => {
    expect(findInkBounds(makeImage(300, 100, () => 240))).toBeNull();
    expect(findInkBounds(textLine(300, 70, 5, 60))).toBeNull(); // already a tight crop
  });
});

describe('contrastStretch', () => {
  it('does not crush shadows on paper when ink is only ~1% of pixels', () => {
    // 100x100: 1% ink (value 20), 30% shadowed paper (225), rest paper (245)
    const img = makeImage(100, 100, (x, y) => {
      const n = y * 100 + x;
      if (n < 100) return 20;
      if (n < 3100) return 225;
      return 245;
    });
    const out = contrastStretch(img);
    const shadow = out.data[(50 * 100 + 10) * 4];
    const paper = out.data[(90 * 100 + 10) * 4];
    expect(shadow).toBeGreaterThan(150); // old 2% clip drove this to 0
    expect(paper).toBe(255);
  });
});

describe('invertIfDark', () => {
  it('does not invert bold dark digits on a light background (mean < 128, median > 128)', () => {
    // 45% ink, 55% light background: the old mean-based rule inverted this
    const img = makeImage(100, 100, (x) => (x < 45 ? 30 : 230));
    const out = invertIfDark(img);
    expect(out.data[0]).toBe(30);
  });

  it('inverts a dark background with light text', () => {
    const img = makeImage(100, 100, (x) => (x < 10 ? 230 : 30));
    const out = invertIfDark(img);
    expect(out.data[(50 * 100 + 50) * 4]).toBe(225);
  });
});
