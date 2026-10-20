import { describe, it, expect } from 'vitest';
import { CashFlowCalculator } from './CashFlowCalculator';

describe('CashFlowCalculator Component', () => {
  it('should export CashFlowCalculator component', () => {
    expect(CashFlowCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof CashFlowCalculator).toBe('function');
  });
});
