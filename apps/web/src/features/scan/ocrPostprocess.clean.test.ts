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
    // √/π from OCR are mapped to something the evaluator accepts, not
    // silently lost ("4√5" used to become "45" = plain wrong)
    ['√16-2', 'sqrt(16)-2'],
    ['√(9+7)', 'sqrt(9+7)'],
    ['4√5+1', '4*sqrt(5)+1'],
    ['2√(9)', '2*sqrt(9)'],
    ['2π', '2*pi'],
    ['2π+1', '2*pi+1'],
    ['π(1+2)', 'pi*(1+2)'],
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

  it('reads % between two operands as a misread multiplication', () => {
    // "12.5%4" silently evaluated as modulo (0.5); OCR read "×" as "%"
    expect(cleanForEvaluation('12.5%4')).toBe('12.5*4');
    // the space before the operands survives cleaning
    expect(cleanForEvaluation('12.5 % 4')).toMatch(/12\.5\*\s*4/);
    expect(evaluateExpression(cleanForEvaluation('12.5%4')).result).toBe(50);
  });

  it('evaluates OCR radicals and pi correctly through the full pipeline', () => {
    const pipeline = (raw: string) => cleanForEvaluation(postprocessOCR(raw));
    // 4 × √5 ≈ 8.944 — used to evaluate as the bare number 45
    expect(Number(evaluateExpression(pipeline('4√5')).result)).toBeCloseTo(4 * Math.sqrt(5), 6);
    expect(evaluateExpression(pipeline('√(9+7)')).result).toBe(4);
    // 2 × π used to evaluate as 2
    expect(Number(evaluateExpression(pipeline('2π')).result)).toBeCloseTo(2 * Math.PI, 6);
  });

  // P1/P2 symbol conversions: √ π ² ³ ^ must SURVIVE cleaning with their
  // meaning, never be deleted (deleting √ turned -8490.57 into -3460).
  it('converts superscript exponents to the caret operator', () => {
    expect(cleanForEvaluation('2²')).toBe('(2)^2');
    expect(evaluateExpression(cleanForEvaluation('2²')).result).toBe(4);
    expect(evaluateExpression(cleanForEvaluation('2.5³')).result).toBe(15.625);
    expect(evaluateExpression(cleanForEvaluation('(2+3)²')).result).toBe(25);
    expect(evaluateExpression(cleanForEvaluation('π²')).result).toBeCloseTo(Math.PI ** 2, 6);
  });

  it('keeps an explicit caret between operands', () => {
    expect(evaluateExpression(cleanForEvaluation('2^3')).result).toBe(8);
    // mathjs ^ is right-associative: 2^(3^2) = 2^9 = 512.
    expect(evaluateExpression(cleanForEvaluation('2^3^2')).result).toBe(512);
  });

  it('reads the P1 radical expression with its exact value', () => {
    // √(4556+546) − 8562 ≈ -8490.57 — reading it WITHOUT the √ gives -3460,
    // which is what users saw when √ was silently deleted.
    expect(cleanForEvaluation('√(4556+546)-8562')).toBe('sqrt(4556+546)-8562');
    expect(Number(evaluateExpression(cleanForEvaluation('√(4556+546)-8562')).result)).toBeCloseTo(
      Math.sqrt(4556 + 546) - 8562,
      6
    );
    expect(Number(evaluateExpression(cleanForEvaluation('√9+π')).result)).toBeCloseTo(
      3 + Math.PI,
      6
    );
    expect(evaluateExpression(cleanForEvaluation('√(16)')).result).toBe(4);
  });

  it('reads the P2 joined display expression end to end', () => {
    const joined = '56162+15660-82626×(9426262÷652)';
    const cleaned = cleanForEvaluation(joined);
    // × ÷ fold to ASCII; the grouping survives intact.
    expect(cleaned).toBe('56162+15660-82626*(9426262/652)');
    expect(evaluateExpression(cleaned).success).toBe(true);
  });

  it('keeps percent signs that are not between two operands', () => {
    expect(cleanForEvaluation('5%')).toBe('5%');
    expect(cleanForEvaluation('50%')).toBe('50%');
    expect(cleanForEvaluation('5%+3')).toBe('5%+3');
    expect(cleanForEvaluation('0.5*%8')).toBe('0.5*8');
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
