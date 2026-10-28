import { describe, it, expect } from 'vitest';
import { appendSmart } from './smartAppend';

describe('appendSmart', () => {
  it('replaces a duplicate binary operator instead of stacking them', () => {
    expect(appendSmart('5+', '+')).toBe('5+');
    expect(appendSmart('5+', '*')).toBe('5*');
    expect(appendSmart('5*', '/')).toBe('5/');
    expect(appendSmart('5*', '^')).toBe('5^');
    expect(appendSmart('5+', '-')).toBe('5-');
  });

  it('keeps unary minus where it is meaningful', () => {
    expect(appendSmart('', '-')).toBe('-');
    expect(appendSmart('(', '-')).toBe('(-');
    expect(appendSmart('(5', '-')).toBe('(5-');
  });

  it('refuses an operator on an empty expression or right after "("', () => {
    expect(appendSmart('', '+')).toBe('');
    expect(appendSmart('', '*')).toBe('');
    expect(appendSmart('(', '+')).toBe('(');
    expect(appendSmart('(', '*')).toBe('(');
  });

  it('allows at most one decimal point per number', () => {
    expect(appendSmart('5.2', '.')).toBe('5.2');
    // A NEW number token still gets its own decimal point.
    expect(appendSmart('5.2+3', '.')).toBe('5.2+3.');
    expect(appendSmart('5', '.')).toBe('5.');
    expect(appendSmart('', '.')).toBe('0.');
    expect(appendSmart('2+', '.')).toBe('2+0.');
  });

  it('refuses a close paren directly after "(" or an operator, and surplus parens', () => {
    expect(appendSmart('(', ')')).toBe('(');
    expect(appendSmart('5+', ')')).toBe('5+');
    expect(appendSmart('5', ')')).toBe('5');
    expect(appendSmart('(5))', ')')).toBe('(5))');
  });

  it('accepts balanced close parens after a digit', () => {
    expect(appendSmart('(5', ')')).toBe('(5)');
  });

  it('inserts implicit multiplication for a digit after ")"', () => {
    expect(appendSmart('(5)', '3')).toBe('(5)*3');
  });

  it('passes plain digits and multi-character tokens through', () => {
    expect(appendSmart('sin(', '2')).toBe('sin(2');
    expect(appendSmart('5', 'atan(')).toBe('5atan(');
    expect(appendSmart('2+', 'pi')).toBe('2+pi');
  });

  it('is pure', () => {
    const prev = '5+';
    appendSmart(prev, '*');
    expect(prev).toBe('5+');
  });
});
