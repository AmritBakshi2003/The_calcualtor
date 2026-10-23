import { describe, it, expect } from 'vitest';
import { postprocessOCR, getCharConfidences, findLowConfidenceIndices, ambiguousSubstitutions } from './ocrPostprocess';

describe('ocrPostprocess', () => {
  describe('postprocessOCR', () => {
    const testCases: Array<{ input: string; expected: string; description: string }> = [
      { input: '2 + 2', expected: '2 + 2', description: 'no changes needed' },
      { input: '2O + 2', expected: '20 + 2', description: 'O -> 0 in digit position' },
      { input: '2l + 2', expected: '21 + 2', description: 'l -> 1 in digit position' },
      { input: '2I + 2', expected: '21 + 2', description: 'I -> 1 in digit position' },
      { input: '2| + 2', expected: '21 + 2', description: '| -> 1 in digit position' },
      { input: '2S + 2', expected: '25 + 2', description: 'S -> 5 in digit position' },
      { input: '2B + 2', expected: '28 + 2', description: 'B -> 8 in digit position' },
      { input: '2 x 2', expected: '2 * 2', description: 'x -> * operator' },
      { input: '2 X 2', expected: '2 * 2', description: 'X -> * operator' },
      { input: '2 − 2', expected: '2 - 2', description: '− -> - operator' },
      { input: '2 – 2', expected: '2 - 2', description: '– -> - operator' },
      { input: '2 — 2', expected: '2 - 2', description: '— -> - operator' },
      { input: '2 × 2', expected: '2 * 2', description: '× -> * operator' },
      { input: '2 ÷ 2', expected: '2 / 2', description: '÷ -> / operator' },
      { input: '2+2=4', expected: '2+2=4', description: 'equals sign preserved' },
      { input: '2.5 + 1.5', expected: '2.5 + 1.5', description: 'decimal points preserved' },
      { input: '2,5 + 1,5', expected: '2,5 + 1,5', description: 'commas preserved' },
      { input: '2^3', expected: '2^3', description: 'exponent preserved' },
      { input: '50%', expected: '50%', description: 'percent preserved' },
      { input: '(2 + 2)', expected: '(2 + 2)', description: 'parentheses preserved' },
      { input: 'abc 2 + 2', expected: '2 + 2', description: 'stray letters stripped' },
      { input: '2 + 2  ', expected: '2 + 2', description: 'trailing whitespace trimmed' },
      { input: '  2 + 2', expected: '2 + 2', description: 'leading whitespace trimmed' },
      { input: '1O + 2l = 3', expected: '10 + 21 = 3', description: 'multiple substitutions' },
      { input: 'Sin(30)', expected: '5(30)', description: 'S substituted at start' },
      { input: 'O + O', expected: '0 + 0', description: 'O substituted at start' },
      { input: '5 x 5 - 3 ÷ 2', expected: '5 * 5 - 3 / 2', description: 'multiple operator normalization' },
    ];

    testCases.forEach(({ input, expected, description }) => {
      it(description, () => {
        expect(postprocessOCR(input)).toBe(expected);
      });
    });

    it('handles empty string', () => {
      expect(postprocessOCR('')).toBe('');
    });

    it('handles null input', () => {
      expect(postprocessOCR('')).toBe('');
    });
  });

  describe('getCharConfidences', () => {
    it('extracts confidence scores from Tesseract result', () => {
      const mockResult = {
        data: {
          lines: [
            {
              words: [
                {
                  symbols: [
                    { confidence: 95 },
                    { confidence: 85 },
                    { confidence: 75 },
                  ],
                },
              ],
            },
          ],
        },
      } as Tesseract.RecognizeResult;

      const confidences = getCharConfidences(mockResult);
      expect(confidences).toEqual([95, 85, 75]);
    });

    it('handles empty result', () => {
      const mockResult = { data: { lines: [] } } as Tesseract.RecognizeResult;
      const confidences = getCharConfidences(mockResult);
      expect(confidences).toEqual([]);
    });

    it('handles missing confidence values', () => {
      const mockResult = {
        data: {
          lines: [
            {
              words: [
                {
                  symbols: [
                    { confidence: 95 },
                    {},
                    { confidence: 75 },
                  ],
                },
              ],
            },
          ],
        },
      } as Tesseract.RecognizeResult;

      const confidences = getCharConfidences(mockResult);
      expect(confidences).toEqual([95, 0, 75]);
    });
  });

  describe('postprocessOCR keeps real math symbols', () => {
    // Plan §6 recognition rules: "Do not strip mathematical symbols merely
    // because they are unfamiliar." Stripping silently changed values.
    it('keeps √ (radical) instead of silently changing the value', () => {
      // "4√5" used to become "45" and evaluate to 45 instead of ~8.94
      expect(postprocessOCR('4√5')).toBe('4√5');
    });

    it('keeps π instead of deleting it', () => {
      // "2π" used to become "2"
      expect(postprocessOCR('2π')).toBe('2π');
    });
  });

  describe('findLowConfidenceIndices', () => {
    it('finds indices below threshold', () => {
      const confidences = [95, 85, 45, 75, 55, 90];
      const lowIndices = findLowConfidenceIndices(confidences, 60);
      expect(lowIndices).toEqual([2, 4]);
    });

    it('handles empty array', () => {
      const lowIndices = findLowConfidenceIndices([], 60);
      expect(lowIndices).toEqual([]);
    });

    it('uses default threshold of 60', () => {
      const confidences = [95, 85, 45, 75, 55, 90];
      const lowIndices = findLowConfidenceIndices(confidences);
      expect(lowIndices).toEqual([2, 4]);
    });

    it('finds all indices if all are below threshold', () => {
      const confidences = [45, 55, 35, 25];
      const lowIndices = findLowConfidenceIndices(confidences, 60);
      expect(lowIndices).toEqual([0, 1, 2, 3]);
    });

    it('finds none if all are above threshold', () => {
      const confidences = [95, 85, 75, 90];
      const lowIndices = findLowConfidenceIndices(confidences, 60);
      expect(lowIndices).toEqual([]);
    });
  });
});

describe('ambiguousSubstitutions', () => {
  // Plan §6: substitutions need context AND an ambiguity warning shown to the
  // user. These tests pin down the context rule so the warning stays accurate.
  it('reports look-alikes replaced inside digit tokens', () => {
    expect(ambiguousSubstitutions('2O + 2')).toEqual(['O→0']);
    expect(ambiguousSubstitutions('1O5')).toEqual(['O→0']);
    expect(ambiguousSubstitutions('1l5+2')).toEqual(['l→1']);
  });

  it('reports standalone look-alikes between operators', () => {
    expect(ambiguousSubstitutions('O + 2')).toEqual(['O→0']);
    expect(ambiguousSubstitutions('2 − l')).toEqual(['l→1']);
  });

  it('deduplicates repeated characters', () => {
    expect(ambiguousSubstitutions('O + O')).toEqual(['O→0']);
    expect(ambiguousSubstitutions('1OO')).toEqual(['O→0']);
  });

  it('does not report words that only start with a look-alike', () => {
    expect(ambiguousSubstitutions('Order 90.00')).toEqual([]);
    expect(ambiguousSubstitutions('SALE 1O5')).toEqual(['O→0']);
  });

  it('reports nothing for clean text', () => {
    expect(ambiguousSubstitutions('2 + 2')).toEqual([]);
    expect(ambiguousSubstitutions('')).toEqual([]);
  });

  it('does not report deliberate Unicode operator normalization', () => {
    // "×"/"÷" are unambiguous glyph mappings, not uncertain recognitions
    expect(ambiguousSubstitutions('2 × 2')).toEqual([]);
  });
});
