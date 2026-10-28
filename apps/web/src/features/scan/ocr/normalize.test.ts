import { describe, it, expect } from 'vitest';
import { normalize, normalizeWithWarnings, SCAN_WHITELIST } from './normalize';

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
    it('maps x / X / * / multiplication dots to ×', () => {
      expect(normalize('2x3')).toBe('2×3');
      expect(normalize('2X3')).toBe('2×3');
      expect(normalize('2*3')).toBe('2×3');
      expect(normalize('(1+2)x4')).toBe('(1+2)×4');
      expect(normalize('2·3')).toBe('2×3'); // multiplication middle dot
      expect(normalize('2∙3')).toBe('2×3'); // bullet operator
      expect(normalize('2⋅3')).toBe('2×3'); // dot operator
      expect(normalize('2∗3')).toBe('2×3'); // asterisk operator
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
      expect(normalize('2^^3')).toBeNull(); // caret now counts as an operator
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
    expect(SCAN_WHITELIST).toBe('0123456789+-×÷*/().=x√π²³^');
    for (const char of normalize('2+3') ?? '') {
      expect(SCAN_WHITELIST.includes(char)).toBe(true);
    }
  });

  describe('keeps radical, pi, and exponent symbols (P1)', () => {
    it('keeps √ in the P1 expression instead of deleting it', () => {
      // "√(4,556+546)−8,562" used to lose the √, so the correct reading
      // became "(4556+546)-8562" and evaluated -3460 instead of -8490.57.
      expect(normalize('√(4,556+546)−8,562')).toBe('√(4556+546)-8562');
    });

    it('keeps the deliberately wrong P1 reading valid (it contains no √)', () => {
      expect(normalize('(4556+546)-8562')).toBe('(4556+546)-8562');
    });

    it('accepts √ at the start and after an operator', () => {
      expect(normalize('√9+π')).toBe('√9+π');
      expect(normalize('2+√9')).toBe('2+√9');
      expect(normalize('√(16)')).toBe('√(16)');
      expect(normalize('√√4')).toBe('√√4'); // nested root: √ is a prefix
    });

    it('keeps exponent superscripts', () => {
      expect(normalize('2²')).toBe('2²');
      expect(normalize('2³+1')).toBe('2³+1');
      expect(normalize('(2+3)²')).toBe('(2+3)²');
    });

    it('keeps the caret operator between operands', () => {
      expect(normalize('2^3')).toBe('2^3');
      expect(normalize('2^3^2')).toBe('2^3^2');
    });

    it('still rejects stranded operators and exponents', () => {
      expect(normalize('2^')).toBeNull(); // unfinished power
      expect(normalize('^2')).toBeNull();
      expect(normalize('2+²')).toBeNull(); // exponent after an operator
      expect(normalize('2^²')).toBeNull(); // exponent after an operator
      expect(normalize('2²²')).toBeNull(); // exponent after an exponent
      expect(normalize('²2')).toBeNull(); // exponent cannot start
    });
  });

  describe('normalizeWithWarnings never drops a symbol silently (P1/P2)', () => {
    it('reports exactly what was dropped, in first-appearance order', () => {
      expect(normalizeWithWarnings('12+34¤')).toEqual({
        expression: '12+34',
        dropped: ['¤'],
      });
      expect(normalizeWithWarnings('2+3¤5¥')).toEqual({
        expression: '2+35',
        dropped: ['¤', '¥'],
      });
    });

    it('does NOT warn about presentation: whitespace and the , separator', () => {
      expect(normalizeWithWarnings('56,162+15,660−82,626')).toEqual({
        expression: '56162+15660-82626',
        dropped: [],
      });
      expect(normalizeWithWarnings('9 − 4')).toEqual({
        expression: '9-4',
        dropped: [],
      });
    });

    it('keeps the P2 joined expression letter-perfect', () => {
      expect(normalizeWithWarnings('56162+15660-82626×(94,26,262÷652)')).toEqual({
        expression: '56162+15660-82626×(9426262÷652)',
        dropped: [],
      });
    });

    it('the wrapped second line alone is not an expression start', () => {
      // Joining wrapped lines is the local candidate builder's job (P2);
      // normalize keeps rejecting a leading operator.
      expect(normalizeWithWarnings('×(94,26,262÷652)').expression).toBeNull();
    });

    it('survives being applied twice (idempotent)', () => {
      const once = normalizeWithWarnings('√(4,556+546)−8,562');
      const twice = normalizeWithWarnings(once.expression ?? '');
      expect(twice.expression).toBe(once.expression);
      expect(twice.dropped).toEqual([]);
    });
  });
});
