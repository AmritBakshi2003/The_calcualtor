export interface SIPInput {
    monthlyInvestment: number;
    annualRate: number;
    tenureYears: number;
    beginOfMonth?: boolean;
}
export interface SIPResult {
    totalInvested: number;
    totalValue: number;
    totalReturns: number;
}
/**
 * Calculate SIP (Systematic Investment Plan) future value
 * Formula: FV = P * [ (1 + r)^n - 1 ] / r * (1 + r)
 * where P = monthly investment, r = monthly rate, n = months
 * If investment at beginning of month, multiply by (1 + r)
 */
export declare function calculateSIP(input: SIPInput): SIPResult;
//# sourceMappingURL=sip.d.ts.map