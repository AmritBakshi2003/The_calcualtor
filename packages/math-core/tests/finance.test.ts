import { describe, it, expect } from 'vitest';
import {
  calculateEMI,
  generateAmortizationSchedule,
  calculateSimpleInterest,
  calculateCompoundInterest,
  calculateSIP,
  calculateLumpSum,
  calculateCAGR,
  calculateROI,
  calculateNPV,
  calculateIRR,
  calculateTax,
  calculateDiscount,
} from '../src';

describe('Finance Calculations', () => {
  describe('EMI', () => {
    it('should calculate EMI correctly', () => {
      const result = calculateEMI({
        principal: 100000,
        annualRate: 10,
        tenureMonths: 12,
      });

      expect(result.emi).toBeCloseTo(8791.59, 2);
      expect(result.totalPayment).toBeCloseTo(105499.06, 2);
      expect(result.totalInterest).toBeCloseTo(5499.06, 2);
    });

    it('should handle zero interest rate', () => {
      const result = calculateEMI({
        principal: 100000,
        annualRate: 0,
        tenureMonths: 12,
      });

      expect(result.emi).toBeCloseTo(8333.33, 2);
      expect(result.totalInterest).toBe(0);
    });

    it('should generate amortization schedule', () => {
      const schedule = generateAmortizationSchedule({
        principal: 100000,
        annualRate: 10,
        tenureMonths: 12,
      });

      expect(schedule).toHaveLength(12);
      expect(schedule[0].month).toBe(1);
      expect(schedule[11].remainingBalance).toBe(0);
    });

    it('should reconcile principal payments with the loan principal', () => {
      const input = { principal: 100000, annualRate: 10, tenureMonths: 12 };
      const schedule = generateAmortizationSchedule(input);

      const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalPayment, 0);
      expect(totalPrincipal).toBeCloseTo(input.principal, 6);

      // Every row pays off its own interest, so principal + interest is what is paid.
      const totalPaid = schedule.reduce(
        (sum, row) => sum + row.principalPayment + row.interestPayment,
        0
      );
      expect(totalPaid).toBeCloseTo(calculateEMI(input).totalPayment, 4);
    });

    it('should let the final installment absorb the residual instead of zeroing it', () => {
      const input = { principal: 1234567, annualRate: 8.75, tenureMonths: 37 };
      const schedule = generateAmortizationSchedule(input);
      const emi = calculateEMI(input).emi;
      const lastRow = schedule[schedule.length - 1];

      // The last installment differs from the others by the rounding residual only.
      expect(Math.abs(lastRow.principalPayment + lastRow.interestPayment - emi)).toBeLessThan(0.01);
      expect(lastRow.remainingBalance).toBe(0);

      const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalPayment, 0);
      expect(totalPrincipal).toBeCloseTo(input.principal, 6);
    });

    it('should produce the same schedule when the EMI is supplied', () => {
      const input = { principal: 250000, annualRate: 7.5, tenureMonths: 24 };
      const emi = calculateEMI(input).emi;

      expect(generateAmortizationSchedule(input, emi)).toEqual(generateAmortizationSchedule(input));
    });

    it('should reject invalid input instead of dividing by zero', () => {
      expect(() => calculateEMI({ principal: 100000, annualRate: 10, tenureMonths: 0 })).toThrow(
        'tenure'
      );

      expect(() => calculateEMI({ principal: 100000, annualRate: 10, tenureMonths: -12 })).toThrow(
        'tenure'
      );

      expect(() => calculateEMI({ principal: 100000, annualRate: 10, tenureMonths: 12.5 })).toThrow(
        'whole number'
      );

      expect(() => calculateEMI({ principal: -1000, annualRate: 10, tenureMonths: 12 })).toThrow(
        'principal'
      );

      expect(() =>
        calculateEMI({ principal: 1000, annualRate: Number.NaN, tenureMonths: 12 })
      ).toThrow('rate');
    });
  });

  describe('Simple Interest', () => {
    it('should calculate simple interest', () => {
      const result = calculateSimpleInterest({
        principal: 10000,
        annualRate: 5,
        timeYears: 3,
      });

      expect(result.interest).toBe(1500);
      expect(result.totalAmount).toBe(11500);
    });

    it('should handle zero rate', () => {
      const result = calculateSimpleInterest({
        principal: 10000,
        annualRate: 0,
        timeYears: 3,
      });

      expect(result.interest).toBe(0);
      expect(result.totalAmount).toBe(10000);
    });
  });

  describe('Compound Interest', () => {
    it('should calculate compound interest annually', () => {
      const result = calculateCompoundInterest({
        principal: 10000,
        annualRate: 5,
        timeYears: 3,
        compoundingFrequency: 'annually',
      });

      expect(result.totalAmount).toBeCloseTo(11576.25, 2);
      expect(result.interest).toBeCloseTo(1576.25, 2);
    });

    it('should calculate compound interest monthly', () => {
      const result = calculateCompoundInterest({
        principal: 10000,
        annualRate: 5,
        timeYears: 3,
        compoundingFrequency: 'monthly',
      });

      expect(result.totalAmount).toBeCloseTo(11614.72, 2);
    });
  });

  describe('SIP', () => {
    it('should calculate SIP returns', () => {
      const result = calculateSIP({
        monthlyInvestment: 5000,
        annualRate: 12,
        tenureYears: 5,
      });

      expect(result.totalInvested).toBe(300000);
      expect(result.totalValue).toBeGreaterThan(300000);
      expect(result.totalReturns).toBeGreaterThan(0);
    });

    it('should handle zero interest', () => {
      const result = calculateSIP({
        monthlyInvestment: 5000,
        annualRate: 0,
        tenureYears: 5,
      });

      expect(result.totalInvested).toBe(300000);
      expect(result.totalValue).toBe(300000);
      expect(result.totalReturns).toBe(0);
    });
  });

  describe('Lump Sum', () => {
    it('should calculate lump sum growth', () => {
      const result = calculateLumpSum({
        principal: 100000,
        annualRate: 10,
        tenureYears: 5,
      });

      expect(result.finalValue).toBeCloseTo(161051, 0);
      expect(result.totalReturns).toBeCloseTo(61051, 0);
    });
  });

  describe('CAGR', () => {
    it('should calculate CAGR', () => {
      const cagr = calculateCAGR({
        startValue: 10000,
        endValue: 16105.1,
        tenureYears: 5,
      });

      expect(cagr.cagr).toBeCloseTo(10, 1);
    });

    it('should throw error for zero start value', () => {
      expect(() =>
        calculateCAGR({
          startValue: 0,
          endValue: 10000,
          tenureYears: 5,
        })
      ).toThrow('Start value cannot be zero');
    });
  });

  describe('ROI', () => {
    it('should calculate ROI', () => {
      const roi = calculateROI({
        initialInvestment: 10000,
        finalValue: 15000,
      });

      expect(roi.roi).toBe(50);
    });

    it('should handle loss', () => {
      const roi = calculateROI({
        initialInvestment: 10000,
        finalValue: 8000,
      });

      expect(roi.roi).toBe(-20);
    });
  });

  describe('NPV', () => {
    it('should calculate NPV', () => {
      const npv = calculateNPV({
        discountRate: 10,
        cashFlows: [-10000, 3000, 3000, 3000, 3000],
      });

      expect(npv.npv).toBeCloseTo(-490.4, 2);
    });
  });

  describe('IRR', () => {
    it('should calculate IRR', () => {
      const irr = calculateIRR([-10000, 3000, 3000, 3000, 3000]);

      expect(irr.irr).toBeCloseTo(7.71, 1);
    });

    it('should throw error for insufficient cash flows', () => {
      expect(() => calculateIRR([10000])).toThrow('IRR requires at least 2 cash flows');
    });

    it('should return a negative IRR for a loss-making project', () => {
      // 1,000/yr against a 10,000 outlay over two years: IRR ≈ -62.98%.
      const irr = calculateIRR([-10000, 1000, 1000]);

      expect(irr.irr).toBeLessThan(0);
      expect(irr.irr).toBeCloseTo(-62.98, 1);
    });

    it('should return an IRR of zero when flows exactly break even', () => {
      const irr = calculateIRR([-1000, 500, 500]);
      expect(irr.irr).toBeCloseTo(0, 6);
    });

    it('should honour an initial guess of zero', () => {
      const withZeroGuess = calculateIRR([-10000, 3000, 3000, 3000, 3000], {
        initialGuess: 0,
      });
      const withDefaultGuess = calculateIRR([-10000, 3000, 3000, 3000, 3000]);

      expect(withZeroGuess.irr).toBeCloseTo(withDefaultGuess.irr, 6);
    });

    it('should converge for large cash flows (relative convergence)', () => {
      const scale = 1e7; // e.g. crores instead of rupees
      const irr = calculateIRR([
        -10000 * scale,
        3000 * scale,
        3000 * scale,
        3000 * scale,
        3000 * scale,
      ]);

      expect(irr.irr).toBeCloseTo(7.71, 1);
    });

    it('should require both positive and negative cash flows', () => {
      expect(() => calculateIRR([1000, 1000, 1000])).toThrow('both positive and negative');
      expect(() => calculateIRR([-1000, -1000])).toThrow('both positive and negative');
    });

    it('should reject non-finite cash flows', () => {
      expect(() => calculateIRR([-1000, Number.NaN, 500])).toThrow('finite');
    });
  });

  describe('Tax', () => {
    it('should calculate exclusive tax', () => {
      const result = calculateTax({
        amount: 100,
        rate: 10,
        mode: 'exclusive',
      });

      expect(result.baseAmount).toBe(100);
      expect(result.taxAmount).toBe(10);
      expect(result.totalAmount).toBe(110);
    });

    it('should calculate inclusive tax', () => {
      const result = calculateTax({
        amount: 110,
        rate: 10,
        mode: 'inclusive',
      });

      expect(result.baseAmount).toBeCloseTo(100, 2);
      expect(result.taxAmount).toBeCloseTo(10, 2);
      expect(result.totalAmount).toBe(110);
    });
  });

  describe('Discount', () => {
    it('should calculate discount', () => {
      const result = calculateDiscount({
        originalPrice: 100,
        discountRate: 20,
      });

      expect(result.discountAmount).toBe(20);
      expect(result.finalPrice).toBe(80);
    });
  });
});
