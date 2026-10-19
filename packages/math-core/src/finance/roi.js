import Decimal from 'decimal.js';
/**
 * Calculate ROI (Return on Investment)
 * Formula: ROI = (Final Value - Initial Investment) / Initial Investment * 100
 */
export function calculateROI(input) {
    const initial = new Decimal(input.initialInvestment);
    const final = new Decimal(input.finalValue);
    if (initial.equals(0)) {
        throw new Error('Initial investment cannot be zero');
    }
    const profit = final.sub(initial);
    const roi = profit.div(initial).mul(100);
    return roi.toNumber();
}
/**
 * Calculate NPV (Net Present Value)
 * Formula: NPV = Σ (CFt / (1 + r)^t) for t = 0 to n
 */
export function calculateNPV(input) {
    const r = new Decimal(input.discountRate).div(100);
    let npv = new Decimal(0);
    for (let t = 0; t < input.cashFlows.length; t++) {
        const cashFlow = new Decimal(input.cashFlows[t]);
        const denominator = r.add(1).pow(t);
        const presentValue = cashFlow.div(denominator);
        npv = npv.add(presentValue);
    }
    return npv.toNumber();
}
const DEFAULT_IRR_OPTIONS = {
    maxIterations: 1000,
    tolerance: 0.0001,
    initialGuess: 0.1,
};
/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * Formula: Find r such that NPV(r) = 0
 */
export function calculateIRR(cashFlows, options = {}) {
    const opts = { ...DEFAULT_IRR_OPTIONS, ...options };
    if (cashFlows.length < 2) {
        throw new Error('IRR requires at least 2 cash flows');
    }
    let rate = new Decimal(opts.initialGuess || 0.1);
    for (let i = 0; i < opts.maxIterations; i++) {
        // Calculate NPV and its derivative at current rate
        let npv = new Decimal(0);
        let dNpv = new Decimal(0);
        for (let t = 0; t < cashFlows.length; t++) {
            const cashFlow = new Decimal(cashFlows[t]);
            const onePlusR = rate.add(1);
            const denominator = onePlusR.pow(t);
            const presentValue = cashFlow.div(denominator);
            npv = npv.add(presentValue);
            // Derivative: -t * CFt / (1 + r)^(t + 1)
            if (t > 0) {
                const derivativeDenominator = onePlusR.pow(t + 1);
                const derivativeValue = cashFlow.mul(-t).div(derivativeDenominator);
                dNpv = dNpv.add(derivativeValue);
            }
        }
        // Check convergence
        if (npv.abs().toNumber() < opts.tolerance) {
            return rate.mul(100).toNumber(); // Return as percentage
        }
        // Newton-Raphson update
        if (dNpv.equals(0)) {
            throw new Error('IRR calculation failed: derivative is zero');
        }
        rate = rate.sub(npv.div(dNpv));
        // Prevent negative rates (for simplicity)
        if (rate.isNegative()) {
            rate = new Decimal(0.01);
        }
    }
    throw new Error('IRR calculation failed: did not converge');
}
