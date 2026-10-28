import Decimal from 'decimal.js';

export type NumberFormat = 'standard' | 'indian';
export type RoundingMode = 'round' | 'floor' | 'ceil' | 'trunc';

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Format a number with specified decimal places
 */
export function formatNumber(
  value: number,
  decimals: number = 2,
  roundingMode: RoundingMode = 'round'
): string {
  const decimal = new Decimal(value);

  let rounded: Decimal;
  switch (roundingMode) {
    case 'round':
      rounded = decimal.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
      break;
    case 'floor':
      rounded = decimal.toDecimalPlaces(decimals, Decimal.ROUND_FLOOR);
      break;
    case 'ceil':
      rounded = decimal.toDecimalPlaces(decimals, Decimal.ROUND_CEIL);
      break;
    case 'trunc':
      rounded = decimal.toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
      break;
  }

  return rounded.toFixed(decimals);
}

/**
 * Format a number with locale-specific grouping
 */
export function formatNumberWithGrouping(
  value: number,
  format: NumberFormat = 'standard',
  decimals: number = 2
): string {
  const formatted = formatNumber(value, decimals);
  const parts = formatted.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';

  // Group only the digits, then restore the sign: `-100000` must not become
  // `-,1,00,000`.
  const negative = integerPart.startsWith('-');
  const digits = negative ? integerPart.slice(1) : integerPart;

  const groupedDigits =
    format === 'indian'
      ? // Indian grouping: last three digits, then pairs (e.g., 10,00,000)
        digits.replace(/(\d)(?=(\d{2})+\d$)/g, '$1,')
      : // Standard grouping: 3,3,3,... (e.g., 100,000)
        digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const grouped = negative ? `-${groupedDigits}` : groupedDigits;
  return decimalPart ? `${grouped}.${decimalPart}` : grouped;
}

/**
 * Format as percentage
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

/**
 * Format as currency (placeholder - currency symbol would be added later)
 */
export function formatCurrency(
  value: number,
  format: NumberFormat = 'standard',
  decimals: number = 2
): string {
  const formatted = formatNumberWithGrouping(value, format, decimals);
  return formatted;
}

/**
 * Format in scientific notation for very large or small numbers
 */
export function formatScientific(value: number, decimals: number = 4): string {
  const decimal = new Decimal(value);
  return decimal.toExponential(decimals);
}

/**
 * Check if a number should be displayed in scientific notation
 */
export function shouldUseScientificNotation(value: number): boolean {
  const absValue = Math.abs(value);
  return absValue >= 1e10 || (absValue < 1e-6 && absValue !== 0);
}

/**
 * Format a number appropriately (scientific or standard)
 */
export function formatNumberAuto(value: number, decimals: number = 2): string {
  if (shouldUseScientificNotation(value)) {
    return formatScientific(value, decimals);
  }
  return formatNumber(value, decimals);
}
