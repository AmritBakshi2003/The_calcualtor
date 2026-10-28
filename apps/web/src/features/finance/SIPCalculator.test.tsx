import { describe, it, expect } from 'vitest';
import { SIPCalculator } from './SIPCalculator';

describe('SIPCalculator Component', () => {
  it('should export SIPCalculator component', () => {
    expect(SIPCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof SIPCalculator).toBe('function');
  });
});
