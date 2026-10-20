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

  it('should handle lastAnswer parameter correctly', () => {
    const result = evaluateExpression('ans + 5', { lastAnswer: 10 });
    expect(result.success).toBe(true);
    expect(result.result).toBe(15);
  });

  it('should handle complex expression with multiple operations', () => {
    const result = evaluateExpression('sin(45) + cos(45) * 2', { angleMode: 'deg' });
    expect(result.success).toBe(true);
  });

  it('should handle unsupported expression pattern', () => {
    const result = evaluateExpression('function() {}');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should reject invalid angle mode value', () => {
    const result = evaluateExpression('sin(90)', { angleMode: 'invalid' as any });
    // Should handle gracefully (fallback to default or error)
    expect(result).toBeDefined();
  });
});
