import { describe, it, expect } from 'vitest';
import { EMICalculator } from './EMICalculator';

describe('EMICalculator Component', () => {
  it('should export EMICalculator component', () => {
    expect(EMICalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof EMICalculator).toBe('function');
  });
});
