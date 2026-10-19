import { describe, it, expect } from 'vitest';
import { parseExpression } from '../src/expression/parser';
import { evaluateExpression } from '../src/expression/evaluator';

describe('Expression Parser', () => {
  describe('parseExpression', () => {
    it('should parse valid expressions', () => {
      const result = parseExpression('2 + 3');
      expect(result.success).toBe(true);
      expect(result.node).toBeDefined();
    });

    it('should reject empty expressions', () => {
      const result = parseExpression('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty expression');
    });

    it('should reject whitespace-only expressions', () => {
      const result = parseExpression('   ');
      expect(result.success).toBe(false);
    });

    it('should reject malicious patterns', () => {
      const maliciousPatterns = [
        'function() {}',
        'x => y',
        'eval(1)',
        'require("fs")',
        'import x from "y"',
        'process.env',
        '__proto__',
        'constructor["prototype"]',
      ];

      for (const pattern of maliciousPatterns) {
        const result = parseExpression(pattern);
        expect(result.success).toBe(false);
        expect(result.error).toContain('prohibited');
      }
    });

    it('should reject assignment operations', () => {
      const result = parseExpression('x = 5');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Assignment');
    });

    it('should reject property access', () => {
      const result = parseExpression('x.y');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Property access');
    });

    it('should handle parse errors gracefully', () => {
      const result = parseExpression('2 + * 3');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('expression validation', () => {
    it('should pass validation for simple arithmetic', () => {
      const result = parseExpression('2 + 3 * 4');
      expect(result.success).toBe(true);
    });

    it('should pass validation for allowed functions', () => {
      const expressions = ['sin(90)', 'cos(45)', 'log(100)', 'sqrt(16)', 'abs(-5)'];
      for (const expr of expressions) {
        const result = parseExpression(expr);
        expect(result.success).toBe(true);
      }
    });

    it('should pass validation for constants', () => {
      const expressions = ['pi', 'e', 'pi + e'];
      for (const expr of expressions) {
        const result = parseExpression(expr);
        expect(result.success).toBe(true);
      }
    });

    it('should pass validation for ans (last answer)', () => {
      const result = parseExpression('ans + 5');
      expect(result.success).toBe(true);
    });
  });
});

describe('Expression Evaluator', () => {
  it('should evaluate simple arithmetic', () => {
    const result = evaluateExpression('2 + 3');
    expect(result.success).toBe(true);
    expect(result.result).toBe(5);
  });

  it('should respect operator precedence', () => {
    const result = evaluateExpression('2 + 3 * 4');
    expect(result.success).toBe(true);
    expect(result.result).toBe(14); // Not 20
  });

  it('should handle division', () => {
    const result = evaluateExpression('10 / 2');
    expect(result.success).toBe(true);
    expect(result.result).toBe(5);
  });

  it('should handle division by zero', () => {
    const result = evaluateExpression('10 / 0');
    expect(result.success).toBe(false);
    // math.js returns Infinity for division by zero, which we catch as overflow
    expect(result.error).toBeDefined();
  });

  it('should handle exponentiation', () => {
    const result = evaluateExpression('2^3');
    expect(result.success).toBe(true);
    expect(result.result).toBe(8);
  });

  it('should handle trigonometric functions in degree mode', () => {
    const result = evaluateExpression('sin(90)', { angleMode: 'deg' });
    expect(result.success).toBe(true);
    expect(Math.abs((result.result as number) - 1)).toBeLessThan(0.0001);
  });

  it('should handle trigonometric functions in radian mode', () => {
    const result = evaluateExpression('sin(pi/2)', { angleMode: 'rad' });
    expect(result.success).toBe(true);
    expect(Math.abs((result.result as number) - 1)).toBeLessThan(0.0001);
  });

  it('should handle constants', () => {
    const result = evaluateExpression('pi');
    expect(result.success).toBe(true);
    expect(Math.abs((result.result as number) - Math.PI)).toBeLessThan(0.0001);
  });

  it('should use last answer', () => {
    const result = evaluateExpression('ans + 5', { lastAnswer: 10 });
    expect(result.success).toBe(true);
    expect(result.result).toBe(15);
  });

  it('should handle overflow', () => {
    const result = evaluateExpression('1e1000');
    expect(result.success).toBe(false);
    expect(result.error).toContain('overflow');
  });

  it('should handle complex results', () => {
    const result = evaluateExpression('sqrt(-1)');
    // math.js supports complex numbers by default
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ re: 0, im: 1 });
  });
});
