/**
 * Validation utilities for mathematical expressions
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
/**
 * Validate that a number is within reasonable bounds
 */
export declare function validateNumberBounds(value: number): ValidationResult;
/**
 * Validate that a percentage value is in valid range (0-100 or any real number)
 */
export declare function validatePercentage(value: number): ValidationResult;
/**
 * Validate that a rate (interest rate, etc.) is reasonable
 */
export declare function validateRate(rate: number): ValidationResult;
/**
 * Validate that a principal amount is non-negative
 */
export declare function validatePrincipal(principal: number): ValidationResult;
/**
 * Validate that a tenure (time period) is positive
 */
export declare function validateTenure(tenure: number): ValidationResult;
/**
 * Validate factorial input (must be non-negative integer)
 */
export declare function validateFactorialInput(n: number): ValidationResult;
/**
 * Validate square root input (must be non-negative for real results)
 */
export declare function validateSqrtInput(n: number): ValidationResult;
/**
 * Validate logarithm input (must be positive)
 */
export declare function validateLogInput(n: number): ValidationResult;
/**
 * Validate expression length to prevent resource exhaustion
 */
export declare function validateExpressionLength(expression: string, maxLength?: number): ValidationResult;
//# sourceMappingURL=validator.d.ts.map