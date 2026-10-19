export interface ROIInput {
    initialInvestment: number;
    finalValue: number;
}
export interface ROIResult {
    roi: number;
}
/**
 * Calculate ROI (Return on Investment)
 * Formula: ROI = (Final Value - Initial Investment) / Initial Investment * 100
 */
export declare function calculateROI(input: ROIInput): ROIResult;
export interface NPVInput {
    discountRate: number;
    cashFlows: number[];
}
export interface NPVResult {
    npv: number;
}
/**
 * Calculate NPV (Net Present Value)
 * Formula: NPV = Σ (CFt / (1 + r)^t) for t = 0 to n
 */
export declare function calculateNPV(input: NPVInput): NPVResult;
export interface IRROptions {
    maxIterations?: number;
    tolerance?: number;
    initialGuess?: number;
}
export interface IRRResult {
    irr: number;
}
/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * Formula: Find r such that NPV(r) = 0
 */
export declare function calculateIRR(cashFlows: number[], options?: IRROptions): IRRResult;
//# sourceMappingURL=roi.d.ts.map