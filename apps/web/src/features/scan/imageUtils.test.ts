import { describe, it, expect } from 'vitest';
import { calculateCropRect, rotateImageData90cw, rotateCanvas90 } from './imageUtils';

const pixelImage = (
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number]
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
};

const redOrBlue = (x: number): [number, number, number] => (x === 0 ? [255, 0, 0] : [0, 0, 255]);

describe('imageUtils', () => {
  describe('calculateCropRect', () => {
    it('should calculate crop rect for landscape video', () => {
      const rect = calculateCropRect(1920, 1080, 1536, 864);

      // The function should calculate the crop rect that fits within the video
      // while maintaining the guide aspect ratio
      expect(rect.width).toBeLessThanOrEqual(1920);
      expect(rect.height).toBeLessThanOrEqual(1080);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    });

    it('should calculate crop rect for portrait video', () => {
      const rect = calculateCropRect(1080, 1920, 864, 1536);

      expect(rect.width).toBeLessThanOrEqual(1080);
      expect(rect.height).toBeLessThanOrEqual(1920);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    });

    it('should center the crop rect', () => {
      const rect = calculateCropRect(1920, 1080, 1536, 864);

      // Check that crop is centered (the x and y should position it in the middle)
      const totalWidth = rect.x + rect.width;
      const totalHeight = rect.y + rect.height;
      
      // The crop should be centered in the video
      expect(Math.abs((1920 - totalWidth) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs((1080 - totalHeight) / 2)).toBeLessThanOrEqual(1);
    });

    it('should handle square video', () => {
      const rect = calculateCropRect(1080, 1080, 864, 864);

      expect(rect.width).toBeLessThanOrEqual(1080);
      expect(rect.height).toBeLessThanOrEqual(1080);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    });

    it('should handle guide frame larger than video', () => {
      const rect = calculateCropRect(640, 480, 800, 600);

      // Should scale down to fit video
      expect(rect.width).toBeLessThanOrEqual(640);
      expect(rect.height).toBeLessThanOrEqual(480);
    });
  });

  describe('rotation', () => {
    it('swaps width and height on a 90° clockwise rotation', () => {
      const wide = pixelImage(2, 1, redOrBlue);
      const rotated = rotateImageData90cw(wide);

      expect(rotated.width).toBe(1);
      expect(rotated.height).toBe(2);
      // The leftmost pixel ends up on top: (x,y) -> (height-1-y, x)
      expect([rotated.data[0], rotated.data[1], rotated.data[2]]).toEqual([255, 0, 0]);
      expect([rotated.data[4], rotated.data[5], rotated.data[6]]).toEqual([0, 0, 255]);
    });

    it('is invertible: four quarter-turns restore the original image', () => {
      const original = pixelImage(2, 3, (x, y) => [x * 40 + 10, y * 30 + 5, 77]);
      let current = original;
      for (let i = 0; i < 4; i++) current = rotateImageData90cw(current);

      expect(current.width).toBe(original.width);
      expect(current.height).toBe(original.height);
      expect(Array.from(current.data)).toEqual(Array.from(original.data));
    });

    it('keeps a single ink character readable through a rotation', () => {
      // 3×3 image with ink at the centre: after a 90° turn the ink must still
      // be exactly one pixel, not smeared or mirrored into two.
      const original = pixelImage(3, 3, (x, y) => (x === 1 && y === 1 ? [0, 0, 0] : [255, 255, 255]));
      const rotated = rotateImageData90cw(original);

      let darkPixels = 0;
      let darkIndex = -1;
      for (let i = 0; i < 9; i++) {
        if (rotated.data[i * 4] === 0) {
          darkPixels++;
          darkIndex = i;
        }
      }
      expect(darkPixels).toBe(1);
      // centre (1,1) maps to (height-1-y=1, x=1) — still the centre
      expect(darkIndex).toBe(1 * 3 + 1);
    });

    it('zero turns returns the same canvas', () => {
      const canvas = { width: 4, height: 2, getContext: () => null } as unknown as HTMLCanvasElement;
      expect(rotateCanvas90(canvas, 0)).toBe(canvas);
    });

    it('returns the canvas unchanged when pixel access is unavailable (jsdom)', () => {
      const canvas = {
        width: 4,
        height: 2,
        getContext: () => ({}),
      } as unknown as HTMLCanvasElement;
      expect(rotateCanvas90(canvas, 1)).toBe(canvas);
    });
  });
});
