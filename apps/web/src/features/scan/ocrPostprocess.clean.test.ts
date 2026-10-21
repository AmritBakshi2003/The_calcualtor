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
    expect(postprocessOCR('OOO')).toBe('000');
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

  it('uses the first line containing a digit for multi-line input', () => {
    expect(cleanForEvaluation('\n2+3\n4*5')).toBe('2+3');
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
