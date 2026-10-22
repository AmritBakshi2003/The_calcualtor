import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../src/expression/evaluator';
import {
  parseExpression,
  MAX_EXPRESSION_LENGTH,
  MAX_NESTING_DEPTH,
} from '../src/expression/parser';

const evaluate = (expression: string, options?: Parameters<typeof evaluateExpression>[1]) =>
  evaluateExpression(expression, options);

describe('Expression sandbox', () => {
  const hostileExpressions = [
    // Property access / indexing
    'x.constructor',
    "x['constructor']",
    '(1).toFixed(2)',
    'x.length',
    'a[1]',
    'process.env',
    // Re-entrant evaluation and construction
    'evaluate("1+1")',
    'parse("1+1")',
    'import(1)',
    'createUnit(1)',
    'simplify("2+2")',
    // Assignment
    'y = 5',
    'f(x) = x',
    // Statements, blocks, arrays, objects
    '2; 3',
    '[1, 2, 3]',
    '{a: 1}',
    // Unknown names
    'window',
    '__proto__',
    'globalThis',
  ];

  for (const expression of hostileExpressions) {
    it(`rejects ${JSON.stringify(expression)}`, () => {
      const result = evaluate(expression);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  }

  it('does not mutate the caller-visible scope when evaluating', () => {
    // `ans` is passed in and must survive repeated evaluation untouched.
    const first = evaluate('ans + 1', { lastAnswer: 10 });
    const second = evaluate('ans + 1', { lastAnswer: 10 });
    expect(first).toEqual({ success: true, result: 11 });
    expect(second).toEqual({ success: true, result: 11 });
  });

  it('rejects unknown symbols rather than resolving them from globals', () => {
    const result = evaluate('Math.PI');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('Expression resource limits', () => {
  it('rejects expressions longer than the maximum length', () => {
    const expression = '1+'.repeat(MAX_EXPRESSION_LENGTH) + '1';
    const result = evaluate(expression);
    expect(result.success).toBe(false);
    expect(result.error).toContain('maximum length');
  });

  it('rejects pathological parenthesis nesting', () => {
    const depth = MAX_NESTING_DEPTH + 50;
    const expression = '('.repeat(depth) + '1' + ')'.repeat(depth);
    const result = evaluate(expression);
    expect(result.success).toBe(false);
    expect(result.error).toContain('nesting');
  });

  it('rejects very large nesting bombs without parsing them', () => {
    const result = evaluate('('.repeat(10_000) + '1' + ')'.repeat(10_000));
    expect(result.success).toBe(false);
  });

  it('accepts ordinary nested parentheses', () => {
    const depth = 20;
    const expression = '('.repeat(depth) + '1+1' + ')'.repeat(depth);
    const result = evaluate(expression);
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it('rejects deeply nested function calls', () => {
    const depth = MAX_NESTING_DEPTH + 5;
    const expression = 'abs('.repeat(depth) + '1' + ')'.repeat(depth);
    const result = evaluate(expression);
    expect(result.success).toBe(false);
  });

  it('enforces the nesting limit through parseExpression too', () => {
    const result = parseExpression('('.repeat(50) + '1' + ')'.repeat(50), { maxNesting: 10 });
    expect(result.success).toBe(false);
  });
});

describe('Angle mode', () => {
  it('returns degrees from inverse trig in degree mode', () => {
    expect(evaluate('asin(1)', { angleMode: 'deg' }).result).toBeCloseTo(90, 10);
    expect(evaluate('acos(0)', { angleMode: 'deg' }).result).toBeCloseTo(90, 10);
    expect(evaluate('atan(1)', { angleMode: 'deg' }).result).toBeCloseTo(45, 10);
  });

  it('returns radians from inverse trig in radian mode', () => {
    expect(evaluate('asin(1)', { angleMode: 'rad' }).result).toBeCloseTo(Math.PI / 2, 10);
    expect(evaluate('acos(0)', { angleMode: 'rad' }).result).toBeCloseTo(Math.PI / 2, 10);
    expect(evaluate('atan(1)', { angleMode: 'rad' }).result).toBeCloseTo(Math.PI / 4, 10);
  });

  it('converts trig input according to the mode', () => {
    expect(evaluate('sin(90)', { angleMode: 'deg' }).result).toBeCloseTo(1, 10);
    expect(evaluate('sin(pi/2)', { angleMode: 'rad' }).result).toBeCloseTo(1, 10);
    expect(evaluate('cos(180)', { angleMode: 'deg' }).result).toBeCloseTo(-1, 10);
  });

  it('reports tan at a right angle instead of returning a huge number', () => {
    const result = evaluate('tan(90)', { angleMode: 'deg' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('undefined');
  });

  it('round-trips inverse and forward trig', () => {
    const angle = evaluate('asin(0.5)', { angleMode: 'deg' });
    expect(angle.result).toBeCloseTo(30, 10);
    expect(evaluate('sin(30)', { angleMode: 'deg' }).result).toBeCloseTo(0.5, 10);
  });
});

describe('Percent semantics', () => {
  it('adds a percentage of the left operand', () => {
    expect(evaluate('200+10%').result).toBeCloseTo(220, 10);
  });

  it('subtracts a percentage of the left operand', () => {
    expect(evaluate('200-10%').result).toBeCloseTo(180, 10);
  });

  it('scales by a percentage', () => {
    expect(evaluate('200*10%').result).toBeCloseTo(20, 10);
  });

  it('treats a bare percentage as a fraction', () => {
    expect(evaluate('50%').result).toBeCloseTo(0.5, 10);
  });

  it('keeps modulo available between two numbers', () => {
    expect(evaluate('17 % 5').result).toBe(2);
  });

  it('chains percentages sequentially', () => {
    // (100 + 10%) + 5% of 110 = 115.5
    expect(evaluate('100+10%+5%').result).toBeCloseTo(115.5, 10);
  });
});

describe('Domain errors', () => {
  it('rejects square roots of negative numbers', () => {
    const result = evaluate('sqrt(-1)');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Square root');
  });

  it.each([
    ['log(0)', 'Logarithm'],
    ['log(-1)', 'Logarithm'],
    ['ln(-1)', 'Logarithm'],
    ['factorial(-1)', 'negative'],
    ['factorial(2.5)', 'integer'],
    ['asin(2)', 'between -1 and 1'],
    ['acosh(0.5)', 'greater than or equal to 1'],
  ])('rejects %s', (expression, message) => {
    const result = evaluate(expression);
    expect(result.success).toBe(false);
    expect(result.error).toContain(message);
  });

  it('never returns a non-numeric result', () => {
    for (const expression of ['sqrt(4)', '2^10', 'abs(-3)', 'factorial(5)']) {
      const result = evaluate(expression);
      expect(result.success).toBe(true);
      expect(typeof result.result).toBe('number');
    }
  });
});

describe('Associativity and precedence', () => {
  it('evaluates exponentiation right-associatively', () => {
    expect(evaluate('2^3^2').result).toBe(512);
  });

  it('respects multiplication before addition', () => {
    expect(evaluate('2+3*4').result).toBe(14);
  });

  it('handles unary minus', () => {
    expect(evaluate('-5+3').result).toBe(-2);
  });

  it('handles factorial', () => {
    expect(evaluate('5!').result).toBe(120);
    expect(evaluate('factorial(5)').result).toBe(120);
  });
});
