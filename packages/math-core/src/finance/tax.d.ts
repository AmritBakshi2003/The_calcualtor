export type TaxMode = 'exclusive' | 'inclusive';
export interface TaxInput {
    amount: number;
    rate: number;
    mode: TaxMode;
}
export interface TaxResult {
    baseAmount: number;
    taxAmount: number;
    totalAmount: number;
}
/**
 * Calculate tax or GST
 * Exclusive mode: tax is added to base amount
 * Inclusive mode: tax is included in total amount
 */
export declare function calculateTax(input: TaxInput): TaxResult;
export interface DiscountInput {
    originalPrice: number;
    discountRate: number;
}
export interface DiscountResult {
    discountAmount: number;
    finalPrice: number;
}
/**
 * Calculate discount
 * Formula: Final Price = Original Price * (1 - discountRate/100)
 */
export declare function calculateDiscount(input: DiscountInput): DiscountResult;
//# sourceMappingURL=tax.d.ts.map