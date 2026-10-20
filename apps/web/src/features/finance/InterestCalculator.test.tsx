import { describe, it, expect } from 'vitest';
import { InterestCalculator } from './InterestCalculator';

describe('InterestCalculator Component', () => {
  it('should export InterestCalculator component', () => {
    expect(InterestCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof InterestCalculator).toBe('function');
  });
});
