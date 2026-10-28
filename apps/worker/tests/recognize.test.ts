import { describe, expect, it } from 'vitest';
import {
  buildRecognizeResult,
  decodedBase64Length,
  mergedDigitsSuspect,
  parseRecognizeRequest,
  structuralMatch,
  unwrapRecognitionText,
} from '../src/recognize';
import { apiErrorFrom } from './helpers';

describe('decodedBase64Length', () => {
  it('buffers with padding are sized correctly', () => {
    expect(decodedBase64Length('ABCD')).toBe(3);
    expect(decodedBase64Length('ABCDAA==')).toBe(4);
  });

  it('rejects non-base64 characters', async () => {
    expect(await apiErrorFrom(() => decodedBase64Length('not base64!'))).toMatchObject({ status: 400 });
  });
});

describe('parseRecognizeRequest', () => {
  const base64Image = 'iVBORw0KGgo=';

  it('accepts a valid body', () => {
    const parsed = parseRecognizeRequest({ image: base64Image, mime: 'image/png', hint: '12+3' });
    expect(parsed).toEqual({ image: base64Image, mime: 'image/png', hint: '12+3', enhanced: null });
  });

  it('accepts an optional enhanced crop image', () => {
    const parsed = parseRecognizeRequest({
      image: base64Image,
      mime: 'image/png',
      hint: null,
      enhanced: base64Image,
    });
    expect(parsed.enhanced).toBe(base64Image);
  });

  it('rejects an invalid enhanced image', async () => {
    expect(
      await apiErrorFrom(() =>
        parseRecognizeRequest({ image: base64Image, mime: 'image/png', hint: null, enhanced: 'no-good!' })
      )
    ).toMatchObject({ status: 400 });
    // Same 5 MB cap as the primary image.
    expect(
      await apiErrorFrom(() =>
        parseRecognizeRequest({
          image: base64Image,
          mime: 'image/png',
          hint: null,
          enhanced: 'A'.repeat(10_000_000),
        })
      )
    ).toMatchObject({ status: 413 });
  });

  it('rejects oversized images', async () => {
    // 7 MB of zeros in base64 = 10M chars
    expect(
      await apiErrorFrom(() =>
        parseRecognizeRequest({ image: 'A'.repeat(10_000_000), mime: 'image/png', hint: null })
      )
    ).toMatchObject({ status: 413 });
  });

  it('rejects unknown mimes and non-string hints', async () => {
    expect(
      await apiErrorFrom(() =>
        parseRecognizeRequest({ image: base64Image, mime: 'image/gif', hint: null })
      )
    ).toMatchObject({ status: 400 });
    expect(
      await apiErrorFrom(() =>
        parseRecognizeRequest({ image: base64Image, mime: 'image/png', hint: 42 })
      )
    ).toMatchObject({ status: 400 });
  });
});

describe('unwrapRecognitionText', () => {
  it('passes a clean expression through', () => {
    expect(unwrapRecognitionText('12+3')).toBe('12+3');
  });

  it('strips stray Markdown fences', () => {
    expect(unwrapRecognitionText('```\n45*2\n```')).toBe('45*2');
  });

  it('collapses UNREADABLE to empty', () => {
    expect(unwrapRecognitionText('unReadable')).toBe('');
  });
});

describe('structuralMatch', () => {
  it('keeps math characters and drops prose', () => {
    expect(structuralMatch('The answer is 12 + 34.')).toBe('12+34.');
  });

  it('drops whitespace: Gemini answers are compact, so a spaced read is never Gemini', () => {
    expect(structuralMatch('1 91+5')).toBe('191+5');
    expect(structuralMatch('99 + 99 / 9')).toBe('99+99/9');
  });

  it('returns empty when no digits survive', () => {
    expect(structuralMatch('no math here')).toBe('');
  });
});

describe('mergedDigitsSuspect — the silent handwriting corruption gate', () => {
  it('flags the real-world misread: operator payload collapsed into a bare digit run', () => {
    expect(mergedDigitsSuspect('99+99÷9', '954095')).toBe(true);
    expect(mergedDigitsSuspect('189 + 82 (misread)', '18982')).toBe(true);
  });

  it('lets a genuinely operator-less reading through', () => {
    expect(mergedDigitsSuspect('7', '7')).toBe(false);
    expect(mergedDigitsSuspect(null, '954095')).toBe(false);
    expect(mergedDigitsSuspect('99+99÷9', '99+99/9')).toBe(false);
  });

  it('does not flag a short operator-less read', () => {
    expect(mergedDigitsSuspect('189+82', '91')).toBe(false);
  });
});

describe('buildRecognizeResult', () => {
  it('returns the corrected expression', () => {
    const result = buildRecognizeResult('144/12');
    expect(result).toEqual({ expression: '144/12', source: 'gemini', unreadable: false });
  });

  it('marks the image unreadable when the model says so', () => {
    expect(buildRecognizeResult('UNREADABLE')).toEqual({
      expression: '',
      source: 'gemini',
      unreadable: true,
    });
  });

  it('rejects answers without math content', async () => {
    expect(await apiErrorFrom(() => buildRecognizeResult('I see only prose'))).toMatchObject({
      status: 502,
    });
  });
});

describe('step-5 JSON contract {expression, uncertain}', () => {
  it('parses a JSON answer with uncertain characters', () => {
    const result = buildRecognizeResult(
      JSON.stringify({
        expression: '√(4556+546)-8562',
        uncertain: [{ index: 0, char: '√', alternatives: ['V', '4'] }],
      })
    );
    expect(result).toEqual({
      expression: '√(4556+546)-8562',
      source: 'gemini',
      unreadable: false,
      uncertain: [{ index: 0, char: '√', alternatives: ['V', '4'] }],
    });
  });

  it('parses fenced JSON and the new display symbols', () => {
    const fenced =
      '```json\n' +
      JSON.stringify({ expression: '144÷12×6', uncertain: [] }) +
      '\n```';
    const result = buildRecognizeResult(fenced);
    expect(result.expression).toBe('144÷12×6');
    expect(result.uncertain).toBeUndefined(); // empty list = no doubt flag
  });

  it('drops junk uncertain entries and keeps the valid one', () => {
    const result = buildRecognizeResult(
      JSON.stringify({
        expression: '12+34',
        uncertain: [
          { index: 0, char: '1', alternatives: ['7'] }, // valid
          { index: -1, char: 'x', alternatives: ['y'] }, // bad index
          { index: 1.5, char: '2', alternatives: ['3'] }, // non-integer
          { index: 2, char: '3', alternatives: [] }, // no alternatives
          'garbage', // not an object
        ],
      })
    );
    expect(result.uncertain).toEqual([{ index: 0, char: '1', alternatives: ['7'] }]);
  });

  it('JSON UNREADABLE still collapses to unreadable', () => {
    expect(
      buildRecognizeResult(JSON.stringify({ expression: 'UNREADABLE', uncertain: [] }))
    ).toEqual({ expression: '', source: 'gemini', unreadable: true });
  });

  it('keeps a bare legacy string answer working (the verify pass)', () => {
    expect(buildRecognizeResult('144/12')).toEqual({
      expression: '144/12',
      source: 'gemini',
      unreadable: false,
    });
  });
});

describe('structuralMatch — display symbol set', () => {
  it('keeps √ π ² ³ ^ % ÷ × and maps dash look-alikes', () => {
    expect(structuralMatch('√(16)')).toBe('√(16)');
    expect(structuralMatch('√9+π')).toBe('√9+π');
    expect(structuralMatch('2²')).toBe('2²');
    expect(structuralMatch('2³')).toBe('2³');
    expect(structuralMatch('2^3')).toBe('2^3');
    expect(structuralMatch('100%')).toBe('100%');
    expect(structuralMatch('144÷12')).toBe('144÷12');
    expect(structuralMatch('6×7')).toBe('6×7');
    expect(structuralMatch('2−3')).toBe('2-3'); // unicode dash look-alike
  });

  it('still strips prose around the expression', () => {
    expect(structuralMatch('Here you go: 12 + 34!')).toBe('12+34');
  });
});
