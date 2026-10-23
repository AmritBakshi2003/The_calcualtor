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
