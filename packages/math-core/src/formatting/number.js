import Decimal from 'decimal.js';
Decimal.set({
    precision: 20,
    rounding: Decimal.ROUND_HALF_UP,
});
/**
 * Format a number with specified decimal places
 */
export function formatNumber(value, decimals = 2, roundingMode = 'round') {
    const decimal = new Decimal(value);
    let rounded;
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
export function formatNumberWithGrouping(value, format = 'standard', decimals = 2) {
    const formatted = formatNumber(value, decimals);
    const parts = formatted.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '';
    if (format === 'indian') {
        // Indian grouping: 3,2,2,... (e.g., 1,00,000)
        const grouped = integerPart.replace(/(\d)(?=(\d{2})+\d$)/g, '$1,');
        return decimalPart ? `${grouped}.${decimalPart}` : grouped;
    }
    else {
        // Standard grouping: 3,3,3,... (e.g., 100,000)
        const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decimalPart ? `${grouped}.${decimalPart}` : grouped;
    }
}
/**
 * Format as percentage
 */
export function formatPercentage(value, decimals = 2) {
    return `${formatNumber(value, decimals)}%`;
}
/**
 * Format as currency (placeholder - currency symbol would be added later)
 */
export function formatCurrency(value, format = 'standard', decimals = 2) {
    const formatted = formatNumberWithGrouping(value, format, decimals);
    return formatted;
}
/**
 * Format in scientific notation for very large or small numbers
 */
export function formatScientific(value, decimals = 4) {
    const decimal = new Decimal(value);
    return decimal.toExponential(decimals);
}
/**
 * Check if a number should be displayed in scientific notation
 */
export function shouldUseScientificNotation(value) {
    const absValue = Math.abs(value);
    return absValue >= 1e10 || (absValue < 1e-6 && absValue !== 0);
}
/**
 * Format a number appropriately (scientific or standard)
 */
export function formatNumberAuto(value, decimals = 2) {
    if (shouldUseScientificNotation(value)) {
        return formatScientific(value, decimals);
    }
    return formatNumber(value, decimals);
}
