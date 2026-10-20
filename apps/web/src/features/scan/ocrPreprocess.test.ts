import { describe, it, expect } from 'vitest';
import {
  grayscale,
  adaptiveThreshold,
  invertIfDark,
} from './ocrPreprocess';

// Mock ImageData for testing
function createMockImageData(data: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width,
    height,
  } as ImageData;
}

describe('ocrPreprocess', () => {
  describe('grayscale', () => {
    it('converts RGB to grayscale', () => {
      const imageData = createMockImageData([255, 0, 0, 255, 0, 255, 0, 255], 2, 1);
      const result = grayscale(imageData);

      // Red (255, 0, 0) -> ~76
      expect(result.data[0]).toBeCloseTo(76, 0);
      expect(result.data[1]).toBeCloseTo(76, 0);
      expect(result.data[2]).toBeCloseTo(76, 0);

      // Green (0, 255, 0) -> ~150
      expect(result.data[4]).toBeCloseTo(150, 0);
      expect(result.data[5]).toBeCloseTo(150, 0);
      expect(result.data[6]).toBeCloseTo(150, 0);
    });
  });

  describe('adaptiveThreshold', () => {
    it('applies threshold to image data', () => {
      const imageData = createMockImageData([200, 200, 200, 255, 50, 50, 50, 255], 2, 1);
      const result = adaptiveThreshold(imageData);

      // Pixels should be either 0 or 255
      expect([0, 255]).toContain(result.data[0]);
      expect([0, 255]).toContain(result.data[4]);
    });
  });

  describe('invertIfDark', () => {
    it('inverts dark image', () => {
      const imageData = createMockImageData([50, 50, 50, 255, 60, 60, 60, 255], 2, 1);
      const result = invertIfDark(imageData);

      expect(result.data[0]).toBe(205);
      expect(result.data[1]).toBe(205);
      expect(result.data[2]).toBe(205);
    });

    it('does not invert light image', () => {
      const imageData = createMockImageData([200, 200, 200, 255, 210, 210, 210, 255], 2, 1);
      const result = invertIfDark(imageData);

      expect(result.data[0]).toBe(200);
      expect(result.data[1]).toBe(200);
      expect(result.data[2]).toBe(200);
    });
  });
});
