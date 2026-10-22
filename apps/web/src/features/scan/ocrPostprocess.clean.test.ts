import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '@calculator-suite/math-core';
import { postprocessOCR, cleanForEvaluation, getKeptSymbolConfidences } from './ocrPostprocess';

describe('postprocessOCR (digit-neighbour fixes)', () => {
  it('keeps the multiplication sign between digits without spaces', () => {
    expect(postprocessOCR('2x3')).toBe('2*3');
    expect(postprocessOCR('(1+2)x4')).toBe('(1+2)*4');
    expect(postprocessOCR('2X3')).toBe('2*3');
  });

  it('converts look-alike letters sandwiched between digits instead of dropping them', () => {
    expect(postprocessOCR('1O5')).toBe('105');
    expect(postprocessOCR('1l5+2')).toBe('115+2');
    expect(postprocessOCR('5S3')).toBe('553');
  });

  it('does not turn a word into digits just because it starts with a look-alike', () => {
    // "Order 90.00" must keep its number intact instead of becoming "0rder"
    expect(postprocessOCR('Order 90.00')).toBe('90.00');
    expect(postprocessOCR('SALE 1O5')).toBe('105');
  });
});

describe('cleanForEvaluation', () => {
  const cases: Array<[string, string]> = [
    ['2+3', '2+3'],
    ['2+3=', '2+3'],
    ['2+3=5', '2+3'],
    ['= 2+3', '2+3'],
    ['1,000+5', '1000+5'],
    ['12,345,678', '12345678'],
    ['2,5+1', '2.5+1'],
    ['2+3+', '2+3'],
    ['2+(', '2'],
    ['(2+3', '(2+3)'],
    ['2+3)', '2+3'],
    ['×2', '2'],
    ['6 × 7', '6 * 7'],
    ['8 ÷ 2', '8 / 2'],
    ['9 − 4', '9 - 4'],
    ['  2 +   3 ', '2 + 3'],
    ['abc', ''],
    ['', ''],
  ];

  cases.forEach(([input, expected]) => {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(cleanForEvaluation(input)).toBe(expected);
    });
  });

  it('uses the first line containing a digit when scores tie', () => {
    expect(cleanForEvaluation('\n2+3\n4*5')).toBe('2+3');
  });

  // The app always runs postprocessOCR first; these mirror that pipeline.
  const pipeline = (raw: string) => cleanForEvaluation(postprocessOCR(raw));

  it('skips a date line above the expression', () => {
    expect(pipeline('12/03/2025\n2 x 45 = 90')).toBe('2 * 45');
  });

  it('skips a price line above the expression', () => {
    expect(pipeline('TOTAL 90.00\n2 x 45 = 90')).toBe('2 * 45');
  });

  it('falls back to the only numeric line when nothing looks like an expression', () => {
    expect(pipeline('Order 90.00')).toBe('90.00');
  });

  it('accepts "x" as multiplication when typed straight into the edit box', () => {
    expect(cleanForEvaluation('2x3')).toBe('2*3');
    expect(cleanForEvaluation('2 x 3')).toBe('2*3');
  });

  it('drops a percent sign OCR inserted after an operator', () => {
    expect(cleanForEvaluation('0.5*%8=')).toBe('0.5*8');
    expect(cleanForEvaluation('%12+3')).toBe('12+3');
  });

  it('keeps a percent sign that follows a number', () => {
    expect(cleanForEvaluation('200 * 10%')).toBe('200 * 10%');
  });

  it('produces input the real evaluator accepts for typical OCR output', () => {
    for (const raw of ['2+3=', '2+3=5', '1,000+5', '(2+3', '6 × 7', '2+3+']) {
      const result = evaluateExpression(cleanForEvaluation(raw));
      expect(result.success, `${raw} -> ${cleanForEvaluation(raw)}`).toBe(true);
    }
    expect(evaluateExpression(cleanForEvaluation('2+3=')).result).toBe(5);
    expect(evaluateExpression(cleanForEvaluation('1,000+5')).result).toBe(1005);
  });
});

describe('getKeptSymbolConfidences', () => {
  it('ignores noise glyphs that postprocessing strips', () => {
    const result = {
      data: {
        lines: [
          {
            words: [
              {
                symbols: [
                  { text: '2', confidence: 95 },
                  { text: '+', confidence: 90 },
                  { text: '#', confidence: 10 },
                  { text: 'q', confidence: 5 },
                  { text: '3', confidence: 40 },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as Tesseract.RecognizeResult;

    expect(getKeptSymbolConfidences(result)).toEqual([95, 90, 40]);
  });
});
