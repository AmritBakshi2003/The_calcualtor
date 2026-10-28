import { describe, it, expect } from 'vitest';
import { TaxCalculator } from './TaxCalculator';

describe('TaxCalculator Component', () => {
  it('should export TaxCalculator component', () => {
    expect(TaxCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof TaxCalculator).toBe('function');
  });
});
