export interface SimpleInterestInput {
    principal: number;
    annualRate: number;
    timeYears: number;
}
export interface SimpleInterestResult {
    interest: number;
    totalAmount: number;
}
export interface CompoundInterestInput {
    principal: number;
    annualRate: number;
    timeYears: number;
    compoundingFrequency: 'annually' | 'semiannually' | 'quarterly' | 'monthly' | 'daily';
}
export interface CompoundInterestResult {
    interest: number;
    totalAmount: number;
}
/**
 * Calculate simple interest
 * Formula: SI = P * R * T / 100
 */
export declare function calculateSimpleInterest(input: SimpleInterestInput): SimpleInterestResult;
/**
 * Calculate compound interest
 * Formula: A = P * (1 + r/n)^(n*t)
 * where r = annual rate, n = compounding frequency per year, t = time in years
 */
export declare function calculateCompoundInterest(input: CompoundInterestInput): CompoundInterestResult;
//# sourceMappingURL=interest.d.ts.map