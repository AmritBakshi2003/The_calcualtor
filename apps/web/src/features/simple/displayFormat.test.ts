import { describe, it, expect } from 'vitest';
import { formatExpressionForDisplay } from './displayFormat';

describe('formatExpressionForDisplay', () => {
  it('rewrites inverse trig names to their button labels', () => {
    expect(formatExpressionForDisplay('atan(')).toBe('tan⁻¹(');
    expect(formatExpressionForDisplay('asin(30)')).toBe('sin⁻¹(30)');
    expect(formatExpressionForDisplay('acos(0.5)+atan(1)')).toBe(
      'cos⁻¹(0.5)+tan⁻¹(1)'
    );
  });

  it('covers the inverse hyperbolics and root functions', () => {
    expect(formatExpressionForDisplay('atanh(0.5)')).toBe('tanh⁻¹(0.5)');
    expect(formatExpressionForDisplay('asinh(1)')).toBe('sinh⁻¹(1)');
    expect(formatExpressionForDisplay('acosh(3)')).toBe('cosh⁻¹(3)');
    expect(formatExpressionForDisplay('sqrt(9)')).toBe('√(9)');
    expect(formatExpressionForDisplay('cbrt(27)')).toBe('³√(27)');
  });

  it('does not rewrite inside longer identifiers or plain text', () => {
    // "tanh(" contains "anh(" but must never collide with "atanh(" handling;
    // likewise a bare "a" prefix inside a larger token stays untouched.
    expect(formatExpressionForDisplay('tanh(1)')).toBe('tanh(1)');
    expect(formatExpressionForDisplay('sinh(1)+cosh(2)')).toBe('sinh(1)+cosh(2)');
  });

  it('leaves ordinary arithmetic untouched', () => {
    expect(formatExpressionForDisplay('12+34')).toBe('12+34');
    expect(formatExpressionForDisplay('2^3*4')).toBe('2^3*4');
    expect(formatExpressionForDisplay('')).toBe('');
  });
});
