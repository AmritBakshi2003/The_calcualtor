import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatNumberWithGrouping,
  formatNumberAuto,
  shouldUseScientificNotation,
} from '../src/formatting/number';

describe('formatNumberWithGrouping', () => {
  it('groups standard thousands', () => {
    expect(formatNumberWithGrouping(1000, 'standard', 2)).toBe('1,000.00');
    expect(formatNumberWithGrouping(1000000, 'standard', 2)).toBe('1,000,000.00');
  });

  it('groups Indian lakhs and crores', () => {
    expect(formatNumberWithGrouping(100000, 'indian', 2)).toBe('1,00,000.00');
    expect(formatNumberWithGrouping(10000000, 'indian', 2)).toBe('1,00,00,000.00');
  });

  it('keeps the sign outside the grouped digits', () => {
    expect(formatNumberWithGrouping(-100000, 'indian', 2)).toBe('-1,00,000.00');
    expect(formatNumberWithGrouping(-1000000, 'standard', 2)).toBe('-1,000,000.00');
  });

  it('does not group numbers below one thousand', () => {
    expect(formatNumberWithGrouping(999, 'standard', 2)).toBe('999.00');
    expect(formatNumberWithGrouping(-999, 'indian', 2)).toBe('-999.00');
  });

  it('rounds to the requested number of decimals', () => {
    expect(formatNumberWithGrouping(1234.5678, 'standard', 2)).toBe('1,234.57');
    expect(formatNumber(1234.5678, 0)).toBe('1235');
  });
});

describe('scientific notation helpers', () => {
  it('flags only extreme magnitudes', () => {
    expect(shouldUseScientificNotation(1e10)).toBe(true);
    expect(shouldUseScientificNotation(1e-7)).toBe(true);
    expect(shouldUseScientificNotation(1234)).toBe(false);
    expect(shouldUseScientificNotation(0)).toBe(false);
  });

  it('formats extreme values in scientific notation', () => {
    expect(formatNumberAuto(1e11, 2)).toContain('e+');
    expect(formatNumberAuto(1234, 2)).toBe('1234.00');
  });
});
