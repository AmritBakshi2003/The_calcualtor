/**
 * Trigonometric functions with angle mode support
 */
export type AngleMode = 'deg' | 'rad';
/**
 * Convert degrees to radians
 */
export declare function degToRad(deg: number): number;
/**
 * Convert radians to degrees
 */
export declare function radToDeg(rad: number): number;
/**
 * Sine with angle mode support
 */
export declare function sin(x: number, mode?: AngleMode): number;
/**
 * Cosine with angle mode support
 */
export declare function cos(x: number, mode?: AngleMode): number;
/**
 * Tangent with angle mode support
 */
export declare function tan(x: number, mode?: AngleMode): number;
/**
 * Arc sine with angle mode support
 */
export declare function asin(x: number, mode?: AngleMode): number;
/**
 * Arc cosine with angle mode support
 */
export declare function acos(x: number, mode?: AngleMode): number;
/**
 * Arc tangent with angle mode support
 */
export declare function atan(x: number, mode?: AngleMode): number;
/**
 * Hyperbolic sine
 */
export declare function sinh(x: number): number;
/**
 * Hyperbolic cosine
 */
export declare function cosh(x: number): number;
/**
 * Hyperbolic tangent
 */
export declare function tanh(x: number): number;
//# sourceMappingURL=trig.d.ts.map