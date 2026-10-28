import { describe, expect, it } from 'vitest';
import { assessComplexity, findUnknownWord, nestingDepth } from './complexity';

describe('nestingDepth', () => {
  it('tracks parenthesis depth', () => {
    expect(nestingDepth('2+3')).toBe(0);
    expect(nestingDepth('(1+2)*3')).toBe(1);
    expect(nestingDepth('((1+2)*(3+(4-5)))')).toBe(3);
    // Unbalanced closers do not go negative.
    expect(nestingDepth(')(')).toBe(1);
  });
});

describe('findUnknownWord', () => {
  it('accepts supported function names', () => {
    expect(findUnknownWord('sqrt(2)^10 + log(1000) + min(3,4)')).toBeNull();
    expect(findUnknownWord('2pi * e')).toBeNull();
  });

  it('flags word problem content', () => {
    expect(findUnknownWord('what is 15% of 350?')).toBe('what');
    expect(findUnknownWord('total price after discount')).toBe('total');
  });
});

describe('assessComplexity', () => {
  it('keeps classic arithmetic simple', () => {
    expect(assessComplexity('12+34')).toEqual({ complex: false, reasons: [] });
    expect(assessComplexity('sqrt(16) * (3.14+1)')).toEqual({ complex: false, reasons: [] });
  });

  it('gates long, deeply nested and word questions', () => {
    const long = '1'.padEnd(61, '1') + '+2';
    expect(assessComplexity(long).complex).toBe(true);
    expect(assessComplexity('((((((1+1)+1)+1)+1)+1)+1)').complex).toBe(true);
    const word = assessComplexity('what is 15% of 350?');
    expect(word.complex).toBe(true);
    expect(word.reasons.some((r) => r.includes('word content'))).toBe(true);
  });

  it('records a local evaluation failure only alongside a structural reason', () => {
    expect(assessComplexity('12..', true).complex).toBe(false);
    const assessment = assessComplexity('what is 15% of 350?', true);
    expect(assessment.reasons).toContain('local evaluation failed');
  });
});
