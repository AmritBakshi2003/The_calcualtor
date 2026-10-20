import { describe, it, expect } from 'vitest';
import { InvestmentCalculator } from './InvestmentCalculator';

describe('InvestmentCalculator Component', () => {
  it('should export InvestmentCalculator component', () => {
    expect(InvestmentCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof InvestmentCalculator).toBe('function');
  });
});
