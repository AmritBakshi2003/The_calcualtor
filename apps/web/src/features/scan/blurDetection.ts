/**
 * Blur Detection using Variance of Laplacian
 */

/**
 * Apply Laplacian filter to image data
 */
function laplacian(imageData: ImageData): number[] {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const grayData = new Float32Array(width * height);

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayData[i / 4] = gray;
  }

  // Apply Laplacian kernel
  const laplacianData: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * grayData[idx] +
        grayData[idx - 1] +
        grayData[idx + 1] +
        grayData[idx - width] +
        grayData[idx + width];
      laplacianData.push(laplacian);
    }
  }

  return laplacianData;
}

/**
 * Calculate variance of Laplacian
 */
function variance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Detect if image is blurry using variance of Laplacian
 * Returns true if variance is below threshold (image is blurry)
 */
export function isBlurry(imageData: ImageData, threshold: number = 100): boolean {
  const laplacianValues = laplacian(imageData);
  const varValue = variance(laplacianValues);
  return varValue < threshold;
}

/**
 * Get blur score (variance of Laplacian)
 * Higher values indicate sharper images
 */
export function getBlurScore(imageData: ImageData): number {
  const laplacianValues = laplacian(imageData);
  return variance(laplacianValues);
}
