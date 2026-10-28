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
export function validateNumberBounds(value: number): ValidationResult {
  if (!isFinite(value)) {
    return { valid: false, error: 'Number is not finite' };
  }

  // Check for very large numbers (close to Number.MAX_VALUE)
  if (Math.abs(value) > 1e308) {
    return { valid: false, error: 'Number is too large' };
  }

  // Check for very small numbers (close to Number.MIN_VALUE)
  if (Math.abs(value) < 1e-308 && value !== 0) {
    return { valid: false, error: 'Number is too small' };
  }

  return { valid: true };
}

/**
 * Validate that a percentage value is in valid range (0-100 or any real number)
 */
export function validatePercentage(value: number): ValidationResult {
  if (!isFinite(value)) {
    return { valid: false, error: 'Percentage must be a finite number' };
  }

  // Percentages can be negative (e.g., -5% for loss) or >100 (e.g., 150%)
  // So we only check for finiteness
  return { valid: true };
}

/**
 * Validate that a rate (interest rate, etc.) is reasonable
 */
export function validateRate(rate: number): ValidationResult {
  if (!isFinite(rate)) {
    return { valid: false, error: 'Rate must be a finite number' };
  }

  // Sanity check: rates typically between -100% and 1000%
  // But allow larger values for edge cases
  if (Math.abs(rate) > 10000) {
    return { valid: false, error: 'Rate is unusually high' };
  }

  return { valid: true };
}

/**
 * Validate that a principal amount is non-negative
 */
export function validatePrincipal(principal: number): ValidationResult {
  if (!isFinite(principal)) {
    return { valid: false, error: 'Principal must be a finite number' };
  }

  if (principal < 0) {
    return { valid: false, error: 'Principal cannot be negative' };
  }

  return { valid: true };
}

/**
 * Validate that a tenure (time period) is positive
 */
export function validateTenure(tenure: number): ValidationResult {
  if (!isFinite(tenure)) {
    return { valid: false, error: 'Tenure must be a finite number' };
  }

  if (tenure <= 0) {
    return { valid: false, error: 'Tenure must be positive' };
  }

  return { valid: true };
}

/**
 * Validate factorial input (must be non-negative integer)
 */
export function validateFactorialInput(n: number): ValidationResult {
  if (!isFinite(n)) {
    return { valid: false, error: 'Factorial input must be finite' };
  }

  if (!Number.isInteger(n)) {
    return { valid: false, error: 'Factorial requires an integer' };
  }

  if (n < 0) {
    return { valid: false, error: 'Factorial is not defined for negative numbers' };
  }

  // Limit to prevent overflow (21! is the largest that fits in safe integer)
  if (n > 170) {
    return { valid: false, error: 'Factorial input is too large' };
  }

  return { valid: true };
}

/**
 * Validate square root input (must be non-negative for real results)
 */
export function validateSqrtInput(n: number): ValidationResult {
  if (!isFinite(n)) {
    return { valid: false, error: 'Square root input must be finite' };
  }

  if (n < 0) {
    return { valid: false, error: 'Square root of negative number is not real' };
  }

  return { valid: true };
}

/**
 * Validate logarithm input (must be positive)
 */
export function validateLogInput(n: number): ValidationResult {
  if (!isFinite(n)) {
    return { valid: false, error: 'Logarithm input must be finite' };
  }

  if (n <= 0) {
    return { valid: false, error: 'Logarithm is defined only for positive numbers' };
  }

  return { valid: true };
}

/**
 * Validate expression length to prevent resource exhaustion
 */
export function validateExpressionLength(expression: string, maxLength = 1000): ValidationResult {
  if (expression.length > maxLength) {
    return { valid: false, error: `Expression exceeds maximum length of ${maxLength} characters` };
  }

  return { valid: true };
}
