/**
 * Trigonometric functions with angle mode support
 */
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
/**
 * Convert degrees to radians
 */
export function degToRad(deg) {
    return deg * DEG_TO_RAD;
}
/**
 * Convert radians to degrees
 */
export function radToDeg(rad) {
    return rad * RAD_TO_DEG;
}
/**
 * Sine with angle mode support
 */
export function sin(x, mode = 'deg') {
    const rad = mode === 'deg' ? degToRad(x) : x;
    return Math.sin(rad);
}
/**
 * Cosine with angle mode support
 */
export function cos(x, mode = 'deg') {
    const rad = mode === 'deg' ? degToRad(x) : x;
    return Math.cos(rad);
}
/**
 * Tangent with angle mode support
 */
export function tan(x, mode = 'deg') {
    const rad = mode === 'deg' ? degToRad(x) : x;
    return Math.tan(rad);
}
/**
 * Arc sine with angle mode support
 */
export function asin(x, mode = 'deg') {
    const rad = Math.asin(x);
    return mode === 'deg' ? radToDeg(rad) : rad;
}
/**
 * Arc cosine with angle mode support
 */
export function acos(x, mode = 'deg') {
    const rad = Math.acos(x);
    return mode === 'deg' ? radToDeg(rad) : rad;
}
/**
 * Arc tangent with angle mode support
 */
export function atan(x, mode = 'deg') {
    const rad = Math.atan(x);
    return mode === 'deg' ? radToDeg(rad) : rad;
}
/**
 * Hyperbolic sine
 */
export function sinh(x) {
    return Math.sinh(x);
}
/**
 * Hyperbolic cosine
 */
export function cosh(x) {
    return Math.cosh(x);
}
/**
 * Hyperbolic tangent
 */
export function tanh(x) {
    return Math.tanh(x);
}
