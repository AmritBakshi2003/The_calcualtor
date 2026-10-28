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
        expect(result.error).toBeTruthy();
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

  it('should reject complex results instead of returning them', () => {
    const result = evaluateExpression('sqrt(-1)');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Square root');
  });

  // Advanced Parser Tests
  it('should parse nested parentheses', () => {
    const result = parseExpression('((2 + 3) * (4 - 1))');
    expect(result.success).toBe(true);
  });

  it('should parse scientific notation', () => {
    const result = parseExpression('1.5e3 + 2.5e2');
    expect(result.success).toBe(true);
  });

  it('should parse decimal edge cases', () => {
    const result = parseExpression('.5 + 5.');
    expect(result.success).toBe(true);
  });

  it('should parse negative numbers at start', () => {
    const result = parseExpression('-5 + 3');
    expect(result.success).toBe(true);
  });

  // Advanced Evaluator Tests
  it('should evaluate nested parentheses', () => {
    const result = evaluateExpression('((2 + 3) * (4 - 1))');
    expect(result.success).toBe(true);
    expect(result.result).toBe(15);
  });

  it('should evaluate scientific notation', () => {
    const result = evaluateExpression('1.5e3 + 2.5e2');
    expect(result.success).toBe(true);
    expect(result.result).toBe(1750);
  });

  it('should evaluate decimal edge cases', () => {
    const result = evaluateExpression('.5 + 5.');
    expect(result.success).toBe(true);
    expect(result.result).toBe(5.5);
  });

  it('should evaluate negative numbers at start', () => {
    const result = evaluateExpression('-5 + 3');
    expect(result.success).toBe(true);
    expect(result.result).toBe(-2);
  });

  it('should handle modulo operation', () => {
    const result = evaluateExpression('17 % 5');
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it('should handle factorial function', () => {
    const result = evaluateExpression('factorial(5)');
    expect(result.success).toBe(true);
    expect(result.result).toBe(120);
  });

  it('should handle logarithm base 10', () => {
    const result = evaluateExpression('log10(1000)');
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it('should handle natural logarithm', () => {
    const result = evaluateExpression('ln(e)');
    expect(result.success).toBe(true);
    expect(Math.abs((result.result as number) - 1)).toBeLessThan(0.0001);
  });

  it('should treat log as base-10, matching the calculator key', () => {
    const result = evaluateExpression('log(100)');
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it('should handle absolute value', () => {
    const result = evaluateExpression('abs(-10)');
    expect(result.success).toBe(true);
    expect(result.result).toBe(10);
  });
});
