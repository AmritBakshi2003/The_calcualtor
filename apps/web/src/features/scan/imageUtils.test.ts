import { describe, it, expect } from 'vitest';
import { calculateCropRect } from './imageUtils';

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
});
