import Decimal from 'decimal.js';

export interface SimpleInterestInput {
  principal: number;
  annualRate: number; // Percentage
  timeYears: number;
}

export interface SimpleInterestResult {
  interest: number;
  totalAmount: number;
}

export interface CompoundInterestInput {
  principal: number;
  annualRate: number; // Percentage
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
export function calculateSimpleInterest(input: SimpleInterestInput): SimpleInterestResult {
  const P = new Decimal(input.principal);
  const R = new Decimal(input.annualRate);
  const T = new Decimal(input.timeYears);

  const interest = P.mul(R).mul(T).div(100);
  const totalAmount = P.add(interest);

  return {
    interest: interest.toNumber(),
    totalAmount: totalAmount.toNumber(),
  };
}

/**
 * Calculate compound interest
 * Formula: A = P * (1 + r/n)^(n*t)
 * where r = annual rate, n = compounding frequency per year, t = time in years
 */
export function calculateCompoundInterest(input: CompoundInterestInput): CompoundInterestResult {
  const P = new Decimal(input.principal);
  const r = new Decimal(input.annualRate).div(100);
  const t = new Decimal(input.timeYears);

  // Get compounding frequency per year
  const nMap = {
    annually: 1,
    semiannually: 2,
    quarterly: 4,
    monthly: 12,
    daily: 365,
  };
  const n = new Decimal(nMap[input.compoundingFrequency]);

  const onePlusRN = r.div(n).add(1);
  const onePlusRNT = onePlusRN.pow(n.mul(t));
  const totalAmount = P.mul(onePlusRNT);
  const interest = totalAmount.sub(P);

  return {
    interest: interest.toNumber(),
    totalAmount: totalAmount.toNumber(),
  };
}
