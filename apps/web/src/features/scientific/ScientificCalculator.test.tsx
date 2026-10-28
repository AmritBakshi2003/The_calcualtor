import { describe, it, expect } from 'vitest';
import { ScientificCalculator } from './ScientificCalculator';

describe('ScientificCalculator Component', () => {
  it('should export ScientificCalculator component', () => {
    expect(ScientificCalculator).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof ScientificCalculator).toBe('function');
  });
});
