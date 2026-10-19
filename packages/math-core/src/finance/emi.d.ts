export interface EMIInput {
    principal: number;
    annualRate: number;
    tenureMonths: number;
}
export interface EMIResult {
    emi: number;
    totalPayment: number;
    totalInterest: number;
    schedule?: AmortizationScheduleItem[];
}
export interface AmortizationScheduleItem {
    month: number;
    principalPayment: number;
    interestPayment: number;
    remainingBalance: number;
}
/**
 * Calculate EMI (Equated Monthly Installment)
 * Formula: EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where P = principal, r = monthly interest rate, n = tenure in months
 */
export declare function calculateEMI(input: EMIInput): EMIResult;
/**
 * Generate amortization schedule
 */
export declare function generateAmortizationSchedule(input: EMIInput): AmortizationScheduleItem[];
//# sourceMappingURL=emi.d.ts.map