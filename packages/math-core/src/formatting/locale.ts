/**
 * Locale-aware formatting utilities
 */

export interface LocaleOptions {
  format: 'standard' | 'indian';
  decimals: number;
  showCurrencySymbol?: boolean;
  currencySymbol?: string;
}

/**
 * Detect user's locale preference (simplified)
 */
export function detectUserLocale(): 'standard' | 'indian' {
  // In a real implementation, this would check browser locale
  // For now, default to standard
  return 'standard';
}
