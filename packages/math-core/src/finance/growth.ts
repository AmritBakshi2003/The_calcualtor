import Decimal from 'decimal.js';

export interface LumpSumInput {
  principal: number;
  annualRate: number; // Percentage
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

/**
 * Calculate lump-sum investment growth (compound interest single payment)
 * Formula: FV = P * (1 + r)^t
 */
export function calculateLumpSum(input: LumpSumInput): LumpSumResult {
  const P = new Decimal(input.principal);
  const r = new Decimal(input.annualRate).div(100);
  const t = new Decimal(input.tenureYears);

  const onePlusR = r.add(1);
  const onePlusRT = onePlusR.pow(t);
  const finalValue = P.mul(onePlusRT);
  const totalReturns = finalValue.sub(P);

  return {
    finalValue: finalValue.toNumber(),
    totalReturns: totalReturns.toNumber(),
  };
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * Formula: CAGR = (End Value / Start Value)^(1/t) - 1
 */
export function calculateCAGR(input: CAGRInput): number {
  const startValue = new Decimal(input.startValue);
  const endValue = new Decimal(input.endValue);
  const t = new Decimal(input.tenureYears);

  if (startValue.equals(0)) {
    throw new Error('Start value cannot be zero');
  }

  if (t.equals(0)) {
    throw new Error('Tenure cannot be zero');
  }

  const ratio = endValue.div(startValue);
  const oneOverT = new Decimal(1).div(t);
  const ratioToPower = ratio.pow(oneOverT);
  const cagr = ratioToPower.sub(1).mul(100);

  return cagr.toNumber();
}
