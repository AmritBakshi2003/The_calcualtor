/**
 * Locale-aware formatting utilities
 */

export interface LocaleOptions {
  format: 'standard' | 'indian';
  decimals: number;
  showCurrencySymbol?: boolean;
  currencySymbol?: string;
}

const DEFAULT_LOCALE_OPTIONS: LocaleOptions = {
  format: 'standard',
  decimals: 2,
  showCurrencySymbol: false,
  currencySymbol: '$',
};

/**
 * Format a number according to locale options
 */
export function formatLocale(
  value: number,
  options: Partial<LocaleOptions> = {}
): string {
  const opts = { ...DEFAULT_LOCALE_OPTIONS, ...options };

  // Import formatCurrency from number.ts
  const { formatCurrency } = require('./number');
  let formatted = formatCurrency(value, opts.format, opts.decimals);

  if (opts.showCurrencySymbol && opts.currencySymbol) {
    formatted = `${opts.currencySymbol}${formatted}`;
  }

  return formatted;
}

/**
 * Detect user's locale preference (simplified)
 */
export function detectUserLocale(): 'standard' | 'indian' {
  // In a real implementation, this would check browser locale
  // For now, default to standard
  return 'standard';
}
