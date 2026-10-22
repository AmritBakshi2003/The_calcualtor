import { describe, it, expect } from 'vitest';
import {
  expressionScore,
  lowConfidenceSymbolCount,
  pickBestCandidate,
  rankSegments,
  textShapeScore,
  type OcrCandidate,
  type OcrSegment,
} from './ocrScoring';

const candidate = (expression: string, confidence: number, source: OcrCandidate['source'] = 'line'): OcrCandidate => ({
  source,
  expression,
  confidence,
  score: expressionScore(expression, confidence),
});

describe('textShapeScore', () => {
  it('prefers a line with an operator over a bigger plain number', () => {
    expect(textShapeScore('2 x 45 = 90')).toBeGreaterThan(textShapeScore('TOTAL 90.00'));
  });

  it('treats dates and clocks as unlikely answers', () => {
    expect(textShapeScore('12/03/2025')).toBeLessThan(textShapeScore('2 x 45 = 90'));
    expect(textShapeScore('9:41')).toBeLessThan(textShapeScore('123 + 456'));
  });

  it('ignores spacing when counting operands', () => {
    expect(textShapeScore('2 * 45')).toBe(textShapeScore('2*45'));
  });
});

describe('expressionScore', () => {
  it('rewards an expression over a bare number', () => {
    expect(expressionScore('2*45', 95)).toBeGreaterThan(expressionScore('90.00', 95));
  });

  it('penalizes text the evaluator rejects', () => {
    expect(expressionScore('2*45', 90)).toBeGreaterThan(expressionScore('2*45*', 90));
  });

  it('uses confidence to break ties between equally shaped candidates', () => {
    expect(expressionScore('12+34', 95)).toBeGreaterThan(expressionScore('12+34', 55));
  });

  it('scores a date-looking expression below a plain expression', () => {
    expect(expressionScore('12/03/2025', 95)).toBeLessThan(expressionScore('12+34', 80));
  });

  it('is not sensitive to spacing', () => {
    expect(expressionScore('12 + 34', 90)).toBe(expressionScore('12+34', 90));
  });

  it('scores empty text as unusable', () => {
    expect(expressionScore('   ', 90)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('rankSegments', () => {
  it('puts the arithmetic line first and keeps document order for ties', () => {
    const segments: OcrSegment[] = [
      { text: 'Milk 45.00', confidence: 90 },
      { text: '2 x 45 = 90', confidence: 80 },
      { text: '30.00', confidence: 90 },
    ];
    expect(rankSegments(segments).map((s) => s.text)).toEqual(['2 x 45 = 90', 'Milk 45.00', '30.00']);
  });
});

describe('pickBestCandidate', () => {
  it('returns the highest-scoring candidate', () => {
    const best = pickBestCandidate([candidate('90.00', 96), candidate('2*45', 95)]);
    expect(best?.expression).toBe('2*45');
  });

  it('ignores unusable candidates', () => {
    expect(pickBestCandidate([candidate('', 99)])).toBeNull();
  });

  it('returns null for no candidates', () => {
    expect(pickBestCandidate([])).toBeNull();
  });
});

describe('lowConfidenceSymbolCount', () => {
  it('counts only readable symbols below the threshold', () => {
    const segment: OcrSegment = {
      text: '2+3',
      confidence: 80,
      symbols: [
        { text: '2', confidence: 95 },
        { text: '+', confidence: 20 },
        { text: '§', confidence: 5 },
        { text: '3', confidence: 30 },
      ],
    };
    expect(lowConfidenceSymbolCount(segment, 60)).toBe(2);
  });

  it('is zero without symbol data', () => {
    expect(lowConfidenceSymbolCount({ text: '2+3', confidence: 90 })).toBe(0);
    expect(lowConfidenceSymbolCount(undefined)).toBe(0);
  });
});
