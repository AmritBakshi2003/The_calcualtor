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
export declare function detectUserLocale(): 'standard' | 'indian';
//# sourceMappingURL=locale.d.ts.map