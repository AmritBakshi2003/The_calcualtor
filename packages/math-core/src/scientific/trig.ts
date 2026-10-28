/**
 * Trigonometric functions with angle mode support
 */

export type AngleMode = 'deg' | 'rad';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert degrees to radians
 */
export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

/**
 * Sine with angle mode support
 */
export function sin(x: number, mode: AngleMode = 'deg'): number {
  const rad = mode === 'deg' ? degToRad(x) : x;
  return Math.sin(rad);
}

/**
 * Cosine with angle mode support
 */
export function cos(x: number, mode: AngleMode = 'deg'): number {
  const rad = mode === 'deg' ? degToRad(x) : x;
  return Math.cos(rad);
}

/**
 * Tangent with angle mode support
 */
export function tan(x: number, mode: AngleMode = 'deg'): number {
  const rad = mode === 'deg' ? degToRad(x) : x;
  return Math.tan(rad);
}

/**
 * Arc sine with angle mode support
 */
export function asin(x: number, mode: AngleMode = 'deg'): number {
  const rad = Math.asin(x);
  return mode === 'deg' ? radToDeg(rad) : rad;
}

/**
 * Arc cosine with angle mode support
 */
export function acos(x: number, mode: AngleMode = 'deg'): number {
  const rad = Math.acos(x);
  return mode === 'deg' ? radToDeg(rad) : rad;
}

/**
 * Arc tangent with angle mode support
 */
export function atan(x: number, mode: AngleMode = 'deg'): number {
  const rad = Math.atan(x);
  return mode === 'deg' ? radToDeg(rad) : rad;
}

/**
 * Hyperbolic sine
 */
export function sinh(x: number): number {
  return Math.sinh(x);
}

/**
 * Hyperbolic cosine
 */
export function cosh(x: number): number {
  return Math.cosh(x);
}

/**
 * Hyperbolic tangent
 */
export function tanh(x: number): number {
  return Math.tanh(x);
}
