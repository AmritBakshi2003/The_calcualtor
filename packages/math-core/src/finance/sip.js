import Decimal from 'decimal.js';
/**
 * Calculate SIP (Systematic Investment Plan) future value
 * Formula: FV = P * [ (1 + r)^n - 1 ] / r * (1 + r)
 * where P = monthly investment, r = monthly rate, n = months
 * If investment at beginning of month, multiply by (1 + r)
 */
export function calculateSIP(input) {
    const P = new Decimal(input.monthlyInvestment);
    const r = new Decimal(input.annualRate).div(100).div(12); // Monthly rate
    const n = new Decimal(input.tenureYears).mul(12); // Total months
    if (r.equals(0)) {
        // Zero interest case
        const totalInvested = P.mul(n);
        return {
            totalInvested: totalInvested.toNumber(),
            totalValue: totalInvested.toNumber(),
            totalReturns: 0,
        };
    }
    const onePlusR = r.add(1);
    const onePlusRToN = onePlusR.pow(n);
    const numerator = onePlusRToN.sub(1);
    const futureValue = P.mul(numerator).div(r).mul(onePlusR);
    // Adjust if investment at beginning of month
    const adjustedFutureValue = input.beginOfMonth ? futureValue.mul(onePlusR) : futureValue;
    const totalInvested = P.mul(n);
    const totalReturns = adjustedFutureValue.sub(totalInvested);
    return {
        totalInvested: totalInvested.toNumber(),
        totalValue: adjustedFutureValue.toNumber(),
        totalReturns: totalReturns.toNumber(),
    };
}
