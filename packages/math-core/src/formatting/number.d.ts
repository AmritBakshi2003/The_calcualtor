export type NumberFormat = 'standard' | 'indian';
export type RoundingMode = 'round' | 'floor' | 'ceil' | 'trunc';
/**
 * Format a number with specified decimal places
 */
export declare function formatNumber(value: number, decimals?: number, roundingMode?: RoundingMode): string;
/**
 * Format a number with locale-specific grouping
 */
export declare function formatNumberWithGrouping(value: number, format?: NumberFormat, decimals?: number): string;
/**
 * Format as percentage
 */
export declare function formatPercentage(value: number, decimals?: number): string;
/**
 * Format as currency (placeholder - currency symbol would be added later)
 */
export declare function formatCurrency(value: number, format?: NumberFormat, decimals?: number): string;
/**
 * Format in scientific notation for very large or small numbers
 */
export declare function formatScientific(value: number, decimals?: number): string;
/**
 * Check if a number should be displayed in scientific notation
 */
export declare function shouldUseScientificNotation(value: number): boolean;
/**
 * Format a number appropriately (scientific or standard)
 */
export declare function formatNumberAuto(value: number, decimals?: number): string;
//# sourceMappingURL=number.d.ts.map