import Decimal from 'decimal.js';
import { validatePrincipal, validateRate, validateTenure } from '../expression/validator';

export interface EMIInput {
  principal: number;
  annualRate: number; // Percentage (e.g., 10 for 10%)
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
 * Validate EMI input at the library boundary.
 * Uses the shared validators so domain rules stay in one place.
 */
function validateEMIInput(input: EMIInput): void {
  const principal = validatePrincipal(input.principal);
  if (!principal.valid) {
    throw new Error(`Invalid principal: ${principal.error}`);
  }

  const rate = validateRate(input.annualRate);
  if (!rate.valid) {
    throw new Error(`Invalid interest rate: ${rate.error}`);
  }

  if (input.annualRate < 0) {
    throw new Error('Invalid interest rate: annual rate cannot be negative');
  }

  const tenure = validateTenure(input.tenureMonths);
  if (!tenure.valid) {
    throw new Error(`Invalid tenure: ${tenure.error}`);
  }

  if (!Number.isInteger(input.tenureMonths)) {
    throw new Error('Invalid tenure: tenure must be a whole number of months');
  }
}

/**
 * Calculate EMI (Equated Monthly Installment)
 * Formula: EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where P = principal, r = monthly interest rate, n = tenure in months
 */
export function calculateEMI(input: EMIInput): EMIResult {
  validateEMIInput(input);

  const P = new Decimal(input.principal);
  const r = new Decimal(input.annualRate).div(100).div(12); // Monthly rate
  const n = new Decimal(input.tenureMonths);

  if (r.equals(0)) {
    // Zero interest case
    const emi = P.div(n);
    return {
      emi: emi.toNumber(),
      totalPayment: P.toNumber(),
      totalInterest: 0,
    };
  }

  const onePlusR = r.add(1);
  const onePlusRToN = onePlusR.pow(n);
  const numerator = P.mul(r).mul(onePlusRToN);
  const denominator = onePlusRToN.sub(1);
  const emi = numerator.div(denominator);

  const totalPayment = emi.mul(n);
  const totalInterest = totalPayment.sub(P);

  return {
    emi: emi.toNumber(),
    totalPayment: totalPayment.toNumber(),
    totalInterest: totalInterest.toNumber(),
  };
}

/**
 * Generate amortization schedule.
 *
 * The last installment absorbs the residual balance instead of the balance
 * being forced to zero, so the schedule reconciles: the principal payments
 * sum exactly to the principal.
 *
 * @param input - EMI input
 * @param emi - Optional already-computed EMI, to avoid recalculating it
 */
export function generateAmortizationSchedule(
  input: EMIInput,
  emi?: number
): AmortizationScheduleItem[] {
  validateEMIInput(input);

  if (emi !== undefined && (!Number.isFinite(emi) || emi < 0)) {
    throw new Error('Invalid EMI: installment must be a finite non-negative number');
  }

  const monthlyRate = new Decimal(input.annualRate).div(100).div(12);
  const installment = new Decimal(emi ?? calculateEMI(input).emi);

  const schedule: AmortizationScheduleItem[] = [];
  let remainingBalance = new Decimal(input.principal);

  for (let month = 1; month <= input.tenureMonths; month++) {
    const interestPayment = remainingBalance.mul(monthlyRate);

    // The final installment clears whatever is left rather than assuming it is
    // exactly zero, which would leave accumulated rounding drift unreported.
    const isFinalMonth = month === input.tenureMonths;
    const principalPayment = isFinalMonth ? remainingBalance : installment.sub(interestPayment);

    remainingBalance = remainingBalance.sub(principalPayment);

    schedule.push({
      month,
      principalPayment: principalPayment.toNumber(),
      interestPayment: interestPayment.toNumber(),
      remainingBalance: remainingBalance.toNumber(),
    });
  }

  return schedule;
}
