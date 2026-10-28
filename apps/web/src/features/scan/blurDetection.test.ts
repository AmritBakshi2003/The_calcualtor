import { describe, it, expect } from 'vitest';
import { isBlurry, getBlurScore } from './blurDetection';

// Mock ImageData for testing
function createMockImageData(data: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width,
    height,
  } as ImageData;
}

describe('blurDetection', () => {
  describe('isBlurry', () => {
    it('detects blurry image (low variance)', () => {
      // Create a uniform image (all same color) - should be blurry
      const data = new Array(100 * 100 * 4).fill(128);
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255; // Alpha
      }
      const imageData = createMockImageData(data, 100, 100);

      expect(isBlurry(imageData, 100)).toBe(true);
    });

    it('detects sharp image (high variance)', () => {
      // Create an image with high contrast - should be sharp
      const data = new Array(100 * 100 * 4);
      for (let i = 0; i < data.length; i += 4) {
        const val = (i / 4) % 2 === 0 ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
      const imageData = createMockImageData(data, 100, 100);

      expect(isBlurry(imageData, 100)).toBe(false);
    });

    it('uses default threshold of 100', () => {
      const data = new Array(100 * 100 * 4).fill(128);
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255;
      }
      const imageData = createMockImageData(data, 100, 100);

      expect(isBlurry(imageData)).toBe(true);
    });
  });

  describe('getBlurScore', () => {
    it('returns variance of Laplacian', () => {
      const data = new Array(100 * 100 * 4).fill(128);
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255;
      }
      const imageData = createMockImageData(data, 100, 100);

      const score = getBlurScore(imageData);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('returns higher score for sharp images', () => {
      // Uniform image
      const uniformData = new Array(100 * 100 * 4).fill(128);
      for (let i = 0; i < uniformData.length; i += 4) {
        uniformData[i + 3] = 255;
      }
      const uniformImageData = createMockImageData(uniformData, 100, 100);

      // High contrast image
      const contrastData = new Array(100 * 100 * 4);
      for (let i = 0; i < contrastData.length; i += 4) {
        const val = (i / 4) % 2 === 0 ? 0 : 255;
        contrastData[i] = val;
        contrastData[i + 1] = val;
        contrastData[i + 2] = val;
        contrastData[i + 3] = 255;
      }
      const contrastImageData = createMockImageData(contrastData, 100, 100);

      const uniformScore = getBlurScore(uniformImageData);
      const contrastScore = getBlurScore(contrastImageData);

      expect(contrastScore).toBeGreaterThan(uniformScore);
    });
  });
});
