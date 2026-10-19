export interface LumpSumInput {
    principal: number;
    annualRate: number;
    tenureYears: number;
}
export interface LumpSumResult {
    finalValue: number;
    totalReturns: number;
}
export interface CAGRInput {
    startValue: number;
    endValue: number;
    tenureYears: number;
}
export interface CAGRResult {
    cagr: number;
}
/**
 * Calculate lump-sum investment growth (compound interest single payment)
 * Formula: FV = P * (1 + r)^t
 */
export declare function calculateLumpSum(input: LumpSumInput): LumpSumResult;
/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * Formula: CAGR = (End Value / Start Value)^(1/t) - 1
 */
export declare function calculateCAGR(input: CAGRInput): CAGRResult;
//# sourceMappingURL=growth.d.ts.map