import Decimal from 'decimal.js';

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
export function calculateROI(input: ROIInput): ROIResult {
  const initial = new Decimal(input.initialInvestment);
  const final = new Decimal(input.finalValue);

  if (initial.equals(0)) {
    throw new Error('Initial investment cannot be zero');
  }

  const profit = final.sub(initial);
  const roi = profit.div(initial).mul(100);

  return { roi: roi.toNumber() };
}

export interface NPVInput {
  discountRate: number; // Percentage
  cashFlows: number[]; // cashFlows[0] is initial investment (negative), rest are inflows
}

export interface NPVResult {
  npv: number;
}

/**
 * Calculate NPV (Net Present Value)
 * Formula: NPV = Σ (CFt / (1 + r)^t) for t = 0 to n
 */
export function calculateNPV(input: NPVInput): NPVResult {
  const r = new Decimal(input.discountRate).div(100);
  let npv = new Decimal(0);

  for (let t = 0; t < input.cashFlows.length; t++) {
    const cashFlow = new Decimal(input.cashFlows[t]);
    const denominator = r.add(1).pow(t);
    const presentValue = cashFlow.div(denominator);
    npv = npv.add(presentValue);
  }

  return { npv: npv.toNumber() };
}

export interface IRROptions {
  maxIterations?: number;
  /** Relative tolerance: convergence when |NPV| <= tolerance * max(1, Σ|CF|). */
  tolerance?: number;
  initialGuess?: number;
}

export interface IRRResult {
  irr: number;
}

const DEFAULT_IRR_OPTIONS: Required<IRROptions> = {
  maxIterations: 200,
  tolerance: 1e-10,
  initialGuess: 0.1,
};

/** Rates are searched on (-100%, 1000%); a rate must keep 1 + r positive. */
const MIN_RATE = -0.9999;
const MAX_RATE = 10;

function npvAndDerivative(cashFlows: number[], rate: Decimal): { npv: Decimal; dNpv: Decimal } {
  const onePlusR = rate.add(1);
  let npv = new Decimal(0);
  let dNpv = new Decimal(0);

  for (let t = 0; t < cashFlows.length; t++) {
    const cashFlow = new Decimal(cashFlows[t]);
    npv = npv.add(cashFlow.div(onePlusR.pow(t)));

    // Derivative: -t * CFt / (1 + r)^(t + 1)
    if (t > 0) {
      dNpv = dNpv.add(cashFlow.mul(-t).div(onePlusR.pow(t + 1)));
    }
  }

  return { npv, dNpv };
}

function npvAt(cashFlows: number[], rate: Decimal): Decimal {
  return npvAndDerivative(cashFlows, rate).npv;
}

/**
 * Calculate IRR (Internal Rate of Return).
 *
 * Solves NPV(r) = 0 for r using Newton-Raphson, falling back to bisection over a
 * bracketed search when Newton stalls or leaves the valid domain. Negative rates
 * are genuine results and are returned as such.
 *
 * When a cash-flow series changes sign more than once there may be several
 * IRRs; this returns the first root found scanning rates upward from -100%,
 * which callers should treat as one candidate rather than a unique answer.
 *
 * @param cashFlows - cashFlows[0] is the initial investment (negative)
 * @param options - Iteration/guess options
 * @returns IRR as a percentage (e.g. 7.71 for 7.71%)
 */
export function calculateIRR(cashFlows: number[], options: IRROptions = {}): IRRResult {
  const opts = { ...DEFAULT_IRR_OPTIONS, ...options };

  if (cashFlows.length < 2) {
    throw new Error('IRR requires at least 2 cash flows');
  }

  if (!cashFlows.every((flow) => Number.isFinite(flow))) {
    throw new Error('IRR requires finite cash flow values');
  }

  const hasPositive = cashFlows.some((flow) => flow > 0);
  const hasNegative = cashFlows.some((flow) => flow < 0);
  if (!hasPositive || !hasNegative) {
    throw new Error('IRR requires both positive and negative cash flows');
  }

  // Scale-aware convergence: an absolute tolerance cannot serve both small and
  // large cash flows.
  const scale = Math.max(
    1,
    cashFlows.reduce((sum, flow) => sum + Math.abs(flow), 0)
  );
  const threshold = new Decimal(opts.tolerance).mul(scale);

  const solved = (rate: Decimal): IRRResult => ({ irr: rate.mul(100).toNumber() });

  // 1. Newton-Raphson from the initial guess.
  let rate = new Decimal(opts.initialGuess);
  for (let i = 0; i < opts.maxIterations; i++) {
    if (!rate.gt(-1)) break;

    const { npv, dNpv } = npvAndDerivative(cashFlows, rate);
    if (npv.abs().lte(threshold)) {
      return solved(rate);
    }
    if (dNpv.isZero() || !dNpv.isFinite()) break;

    const next = rate.sub(npv.div(dNpv));
    if (!next.isFinite() || !next.gt(-1) || next.gt(MAX_RATE)) break;
    rate = next;
  }

  // 2. Bisection fallback: scan for a sign change, then close the bracket.
  let previousRate = new Decimal(MIN_RATE);
  let previousNpv = npvAt(cashFlows, previousRate);

  const samples = 400;
  for (let i = 1; i <= samples; i++) {
    const currentRate = new Decimal(MIN_RATE).add(
      new Decimal(MAX_RATE - MIN_RATE).mul(i).div(samples)
    );
    const currentNpv = npvAt(cashFlows, currentRate);

    if (!currentNpv.isNaN() && currentNpv.isZero()) {
      return solved(currentRate);
    }

    const brackets =
      !currentNpv.isNaN() &&
      !previousNpv.isNaN() &&
      previousNpv.isNegative() !== currentNpv.isNegative();

    if (brackets) {
      let low = previousRate;
      let high = currentRate;
      let lowNpv = previousNpv;

      for (let iteration = 0; iteration < 200; iteration++) {
        const mid = low.add(high).div(2);
        const midNpv = npvAt(cashFlows, mid);

        if (midNpv.abs().lte(threshold) || high.sub(low).abs().lte(1e-15)) {
          return solved(mid);
        }

        if (lowNpv.isNegative() === midNpv.isNegative()) {
          low = mid;
          lowNpv = midNpv;
        } else {
          high = mid;
        }
      }

      return solved(low.add(high).div(2));
    }

    previousRate = currentRate;
    previousNpv = currentNpv;
  }

  throw new Error('IRR calculation failed: no rate between -100% and 1000% makes NPV zero');
}
