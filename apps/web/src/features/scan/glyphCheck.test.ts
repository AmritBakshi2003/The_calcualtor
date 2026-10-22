import { describe, it, expect } from 'vitest';
import { classifyPlusOrDivide } from './glyphCheck';

/** Build a grayscale ImageData from an ink-drawing callback. */
function makeImage(width: number, height: number, isInk: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = isInk(x, y) ? 20 : 240;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  // The API consumers use is the plain shape Tesseract gives us.
  return { data, width, height } as ImageData;
}

/** A plus glyph: one connected component crossing in the middle. */
const plus = makeImage(60, 60, (x, y) => {
  const barH = y >= 26 && y < 35 && x >= 6 && x < 54;
  const barV = x >= 26 && x < 35 && y >= 6 && y < 54;
  return barH || barV;
});

/** A divide glyph: wide bar with a dot above and a dot below. */
const divide = makeImage(60, 60, (x, y) => {
  const bar = y >= 26 && y < 35 && x >= 6 && x < 54;
  const dotTop = y >= 8 && y < 20 && x >= 24 && x < 36;
  const dotBottom = y >= 40 && y < 52 && x >= 24 && x < 36;
  return bar || dotTop || dotBottom;
});

describe('classifyPlusOrDivide', () => {
  it('calls a single connected component a plus', () => {
    expect(classifyPlusOrDivide(plus)).toBe('plus');
  });

  it('calls bar + two dots a divide', () => {
    expect(classifyPlusOrDivide(divide)).toBe('divide');
  });

  it('returns unknown for a blank image', () => {
    expect(classifyPlusOrDivide(makeImage(60, 60, () => false))).toBe('unknown');
  });

  it('returns unknown when noise drops below the speck threshold', () => {
    // Two tiny 4x4 specks: below the 3% minimum, so they are noise not dots.
    const noise = makeImage(60, 60, (x, y) => {
      const a = y >= 5 && y < 9 && x >= 5 && x < 9;
      const b = y >= 50 && y < 54 && x >= 50 && x < 54;
      return a || b;
    });
    expect(classifyPlusOrDivide(noise)).toBe('unknown');
  });

  it('returns unknown for bar-with-dots whose dots are off center', () => {
    const off = makeImage(60, 60, (x, y) => {
      const bar = y >= 26 && y < 35 && x >= 6 && x < 54;
      const dotTop = y >= 8 && y < 20 && x >= 6 && x < 18; // far left
      const dotBottom = y >= 40 && y < 52 && x >= 24 && x < 36;
      return bar || dotTop || dotBottom;
    });
    expect(classifyPlusOrDivide(off)).toBe('unknown');
  });

  it('returns unknown for two components (broken divide)', () => {
    const broken = makeImage(60, 60, (x, y) => {
      const bar = y >= 26 && y < 35 && x >= 6 && x < 54;
      const dotTop = y >= 8 && y < 20 && x >= 24 && x < 36;
      return bar || dotTop; // bottom dot missing
    });
    expect(classifyPlusOrDivide(broken)).toBe('unknown');
  });
});
