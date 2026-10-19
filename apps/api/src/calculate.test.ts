import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '@calculator-suite/math-core';

describe('API Calculate Logic', () => {
  it('should evaluate valid expression', () => {
    const result = evaluateExpression('2 + 3 * 4');
    expect(result.success).toBe(true);
    expect(result.result).toBe(14);
  });

  it('should handle invalid expression', () => {
    const result = evaluateExpression('2 + * 3');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle empty expression', () => {
    const result = evaluateExpression('');
    expect(result.success).toBe(false);
  });

  it('should handle angle mode', () => {
    const result = evaluateExpression('sin(90)', { angleMode: 'deg' });
    expect(result.success).toBe(true);
  });
});
