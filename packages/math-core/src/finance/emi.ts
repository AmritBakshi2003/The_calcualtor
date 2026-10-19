import Decimal from 'decimal.js';

export interface EMIInput {
  principal: number;
  annualRate: number; // Percentage (e.g., 10 for 10%)
  tenureMonths: number;
}

export interface EMIResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
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
export function calculateEMI(input: EMIInput): EMIResult {
  const P = new Decimal(input.principal);
  const r = new Decimal(input.annualRate).div(100).div(12); // Monthly rate
  const n = new Decimal(input.tenureMonths);

  if (r.equals(0)) {
    // Zero interest case
    const emi = P.div(n);
    const totalPayment = P;
    const totalInterest = new Decimal(0);
    return {
      emi: emi.toNumber(),
      totalPayment: totalPayment.toNumber(),
      totalInterest: totalInterest.toNumber(),
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
 * Generate amortization schedule
 */
export function generateAmortizationSchedule(input: EMIInput): AmortizationScheduleItem[] {
  const schedule: AmortizationScheduleItem[] = [];
  const emiResult = calculateEMI(input);
  const emi = new Decimal(emiResult.emi);
  const P = new Decimal(input.principal);
  const r = new Decimal(input.annualRate).div(100).div(12);
  let remainingBalance = P;

  for (let month = 1; month <= input.tenureMonths; month++) {
    const interestPayment = remainingBalance.mul(r);
    const principalPayment = emi.sub(interestPayment);
    remainingBalance = remainingBalance.sub(principalPayment);

    // Handle last month rounding
    if (month === input.tenureMonths) {
      remainingBalance = new Decimal(0);
    }

    schedule.push({
      month,
      principalPayment: principalPayment.toNumber(),
      interestPayment: interestPayment.toNumber(),
      remainingBalance: remainingBalance.toNumber(),
    });
  }

  return schedule;
}
