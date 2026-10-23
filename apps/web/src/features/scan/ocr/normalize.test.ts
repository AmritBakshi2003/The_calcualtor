import { describe, it, expect } from 'vitest';
import { normalize, SCAN_WHITELIST } from './normalize';

describe('normalize', () => {
  describe('passes clean whitelist text through', () => {
    it('keeps plain expressions', () => {
      expect(normalize('12+34')).toBe('12+34');
      expect(normalize('(1+2)*3')).toBe('(1+2)×3'); // * is mapped to the display form ×
      expect(normalize('2.5÷4')).toBe('2.5÷4');
      expect(normalize('3.14')).toBe('3.14');
    });

    it('removes whitespace', () => {
      expect(normalize('2 + 3')).toBe('2+3');
      expect(normalize(' 12×4 ')).toBe('12×4');
      expect(normalize('2\t+\n3')).toBe('2+3');
    });

    it('strips trailing "=" result markers (calculator screens)', () => {
      expect(normalize('2+3=')).toBe('2+3');
      expect(normalize('2+3==')).toBe('2+3');
      expect(normalize('=')).toBeNull();
    });

    it('keeps a mid-expression "=" when the text stays valid', () => {
      expect(normalize('2+3=5')).toBe('2+3=5');
    });
  });

  describe('maps look-alikes onto the alphabet', () => {
    it('maps x / X / * to ×', () => {
      expect(normalize('2x3')).toBe('2×3');
      expect(normalize('2X3')).toBe('2×3');
      expect(normalize('2*3')).toBe('2×3');
      expect(normalize('(1+2)x4')).toBe('(1+2)×4');
    });

    it('maps ÷ look-alikes to ÷', () => {
      expect(normalize('8∕2')).toBe('8÷2'); // division slash
      expect(normalize('8⁄2')).toBe('8÷2'); // fraction slash
      expect(normalize('8:2')).toBe('8÷2'); // printed ratio
    });

    it('maps dash look-alikes to the ASCII minus', () => {
      expect(normalize('9−4')).toBe('9-4'); // unicode minus
      expect(normalize('9–4')).toBe('9-4'); // en dash
      expect(normalize('9—4')).toBe('9-4'); // em dash
    });
  });

  describe('removes characters outside the whitelist', () => {
    it('drops look-alike letters and noise glyphs', () => {
      expect(normalize('2O + 2')).toBe('2+2');
      expect(normalize('12,5+1')).toBe('125+1');
      expect(normalize('$5+3')).toBe('5+3');
      expect(normalize('Total 7×8!')).toBe('7×8');
    });

    it('documents the clock caveat: "9:41" becomes "9÷41"', () => {
      // The colon is a ÷ look-alike. A time-shaped raw line normalizes to a
      // valid but wrong expression; candidate scoring penalises clock-shaped
      // RAW text (expressionScore keeps the raw line), so the real expression
      // outranks it.
      expect(normalize('9:41')).toBe('9÷41');
    });
  });

  describe('returns null for invalid input', () => {
    it('rejects empty and non-expression text', () => {
      expect(normalize('')).toBeNull();
      expect(normalize('   ')).toBeNull();
      expect(normalize('total')).toBeNull();
      expect(normalize('=5')).toBeNull();
    });

    it('rejects unbalanced brackets', () => {
      expect(normalize('(2+3')).toBeNull();
      expect(normalize('2+3)')).toBeNull();
      expect(normalize(')2+3(')).toBeNull();
      expect(normalize('(2+3))')).toBeNull();
      expect(normalize('((2+3)')).toBeNull();
    });

    it('rejects two operators in a row', () => {
      expect(normalize('2++3')).toBeNull();
      expect(normalize('2+-3')).toBeNull();
      expect(normalize('3××4')).toBeNull();
      expect(normalize('5×÷2')).toBeNull();
    });

    it('rejects expressions that do not start and end with a number or bracket', () => {
      expect(normalize('-5+3')).toBeNull(); // leading operator
      expect(normalize('2+3+')).toBeNull(); // trailing operator
      expect(normalize('×2+3')).toBeNull();
      expect(normalize('.5+1')).toBeNull(); // leading decimal point
      expect(normalize('2+3.')).toBeNull(); // trailing decimal point
      expect(normalize('+')).toBeNull();
    });
  });

  it('the alphabet it cleans to is the scan whitelist', () => {
    // Single source of truth with the Tesseract setting (useOCRWorker.ts).
    expect(SCAN_WHITELIST).toBe('0123456789+-×÷*/().=x');
    for (const char of normalize('2+3') ?? '') {
      expect(SCAN_WHITELIST.includes(char)).toBe(true);
    }
  });
});
