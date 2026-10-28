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

  it('detects a date even when a word sits on the same line', () => {
    // "Order 12/03/2025" used to escape the ^...$ anchored guard via the word
    expect(textShapeScore('Order 12/03/2025')).toBeLessThan(textShapeScore('2+3'));
    expect(textShapeScore('Order 12/03/2025')).toBeLessThan(textShapeScore('Total 2+3'));
  });

  it('detects a clock even when a word sits on the same line', () => {
    expect(textShapeScore('Total 9:41')).toBeLessThan(textShapeScore('2+3'));
  });

  it('does not strip digits or operators when removing words', () => {
    expect(textShapeScore('12/03/2025')).toBe(textShapeScore('12/03/2025 ')); // words only
    expect(textShapeScore('2 x 3')).not.toBe(textShapeScore('23'));
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

  it('penalizes a word-prefixed date line the evaluator would still accept', () => {
    // "Order 12/03/2025" cleans to "12/03/2025" and even parses; without the
    // word strip it scored like a valid expression and beat "2+3".
    expect(expressionScore('12 / 3 / 2025', 95, 'Order 12/03/2025')).toBeLessThan(
      expressionScore('2+3', 60)
    );
  });

  it('still penalizes a bare date or clock', () => {
    expect(expressionScore('12 / 3 / 2025', 95)).toBeLessThan(expressionScore('2+3', 60));
    expect(expressionScore('9 : 41', 95, '9:41 pm')).toBeLessThan(expressionScore('2+3', 60));
  });

  it('scores empty text as unusable', () => {
    expect(expressionScore('   ', 90)).toBe(Number.NEGATIVE_INFINITY);
  });

  // P4: "6×7" and "144÷12" must parse and win against a lone digit. Raw
  // ×/÷ candidates used to be fed to the evaluator as-is, scored -40, and
  // silently lost.
  it('scores a display-alphabet multiplication candidate as parseable', () => {
    expect(expressionScore('6×7', 60, '6x7')).toBeGreaterThan(expressionScore('7', 60, '7'));
  });

  it('scores a display-alphabet division candidate as parseable', () => {
    expect(expressionScore('144÷12', 60, '144÷12')).toBeGreaterThan(expressionScore('12', 60, '12'));
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

  // A date or clock beside a word must not outrank the expression anymore.
  it('ranks the expression above dates/clocks with surrounding words', () => {
    const segments: OcrSegment[] = [
      { text: 'Order 12/03/2025', confidence: 95 },
      { text: '2+3=', confidence: 80 },
      { text: 'Total 9:41', confidence: 95 },
    ];
    expect(rankSegments(segments)[0].text).toBe('2+3=');
  });

  it('ranks the expression above prices and reference numbers with words', () => {
    const segments: OcrSegment[] = [
      { text: 'Item 4.50', confidence: 95 },
      { text: '12 × 3 =', confidence: 80 },
      { text: 'Ref 2025', confidence: 95 },
    ];
    expect(rankSegments(segments)[0].text).toBe('12 × 3 =');
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
