import { describe, it, expect } from 'vitest';
import { estimateSkewAngle, deskewCanvas } from './ocrPreprocess';

const makeImageData = (
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = valueAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
};

/** One line of ink at `angleDeg`: positive descends to the right. */
const inkLine = (angleDeg: number): ImageData => {
  const width = 200;
  const height = 100;
  return makeImageData(width, height, (x, y) => {
    const yc = height / 2;
    const target = Math.round(yc + Math.tan((angleDeg * Math.PI) / 180) * (x - (width - 1) / 2));
    if (y < 0 || y >= height) return 255;
    return y === target ? 0 : 255;
  });
};

describe('estimateSkewAngle', () => {
  it('reports ~0 for a level line of text', () => {
    expect(Math.abs(estimateSkewAngle(inkLine(0)))).toBeLessThan(0.5);
  });

  it('detects ink descending to the right (+3°)', () => {
    const angle = estimateSkewAngle(inkLine(3));
    expect(angle).toBeGreaterThan(2);
    expect(angle).toBeLessThan(4);
  });

  it('detects ink rising to the right (−3°) as negative', () => {
    const angle = estimateSkewAngle(inkLine(-3));
    expect(angle).toBeGreaterThan(-4);
    expect(angle).toBeLessThan(-2);
  });

  it('returns 0 for a blank image', () => {
    expect(estimateSkewAngle(makeImageData(50, 50, () => 255))).toBe(0);
  });

  it('returns 0 when ink is the majority (inverted capture)', () => {
    // computeInkMask gives up on images where ink is not the minority class
    expect(estimateSkewAngle(makeImageData(50, 50, () => 0))).toBe(0);
  });

  it('stays inside the maxAngle bound', () => {
    // A 30° line must not be reported as more than maxAngle (default 15)
    const angle = estimateSkewAngle(inkLine(30), { maxAngle: 15 });
    expect(Math.abs(angle)).toBeLessThanOrEqual(15);
  });
});

describe('deskewCanvas', () => {
  it('corrects nothing and reports angle 0 when pixel access is unavailable', () => {
    const fake = {
      width: 200,
      height: 100,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    const result = deskewCanvas(fake);
    expect(result.corrected).toBe(false);
    expect(result.angle).toBe(0);
    expect(result.canvas).toBe(fake);
  });

  it('does not redraw when pixel access is unavailable (jsdom)', () => {
    const fake = {
      width: 10,
      height: 10,
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement;
    const result = deskewCanvas(fake);
    expect(result.corrected).toBe(false);
    expect(result.canvas).toBe(fake);
  });

  it('reports angle 0 for zero-sized canvases', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const result = deskewCanvas(canvas);
    expect(result.angle).toBe(0);
    expect(result.corrected).toBe(false);
  });
});
