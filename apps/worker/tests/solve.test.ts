import { describe, expect, it } from 'vitest';
import {
  assertClientEvaluable,
  buildSolveResult,
  looksLikeSimpleArithmetic,
  parseSolveRequest,
  unwrapAnswerText,
} from '../src/solve';
import { apiErrorFrom } from './helpers';

describe('parseSolveRequest', () => {
  it('accepts a valid question', () => {
    expect(parseSolveRequest({ question: '15% of 350' })).toEqual({ question: '15% of 350' });
  });

  it('rejects empty, digit-free and oversized questions', async () => {
    expect(await apiErrorFrom(() => parseSolveRequest({}))).toMatchObject({ status: 400 });
    expect(await apiErrorFrom(() => parseSolveRequest({ question: 'hello world' }))).toMatchObject({
      status: 400,
      code: 'NO_NUMERIC_CONTENT',
    });
    expect(
      await apiErrorFrom(() => parseSolveRequest({ question: '2 + 3 '.padEnd(502, '7') }))
    ).toMatchObject({ status: 400, code: 'QUESTION_TOO_LONG' });
  });
});

describe('looksLikeSimpleArithmetic (server gate)', () => {
  it('flags classic numeric arithmetic as client-evaluable', () => {
    expect(looksLikeSimpleArithmetic('2+3')).toBe(true);
    expect(looksLikeSimpleArithmetic('(1+2)*3')).toBe(true);
    expect(looksLikeSimpleArithmetic('12.5*8')).toBe(true);
  });

  it('lets complex/word questions through to the model', () => {
    expect(looksLikeSimpleArithmetic('sqrt(2)^10 + log(1000)')).toBe(false);
    expect(looksLikeSimpleArithmetic('what is 15% of 350?')).toBe(false);
    expect(looksLikeSimpleArithmetic('x + y')).toBe(false);
    expect(looksLikeSimpleArithmetic('2+3 '.padEnd(90, '7'))).toBe(false);
  });

  it('still gates simple arithmetic the client failed on', async () => {
    expect(await apiErrorFrom(() => assertClientEvaluable('2+3'))).toMatchObject({
      status: 400,
      code: 'CLIENT_EVALUABLE',
    });
  });
});

describe('unwrapAnswerText', () => {
  it('passes plain numbers through', () => {
    expect(unwrapAnswerText('42')).toEqual({ answer: '42' });
    expect(unwrapAnswerText('-3.75')).toEqual({ answer: '-3.75' });
    expect(unwrapAnswerText('1,234')).toEqual({ answer: '1234' });
  });

  it('accepts short decorated numeric replies', () => {
    expect(unwrapAnswerText('= 52.5')).toEqual({ answer: '52.5' });
    expect(unwrapAnswerText('$ 1,234')).toEqual({ answer: '1234' });
  });

  it('maps UNANSWERABLE to null', () => {
    expect(unwrapAnswerText('UNANSWERABLE')).toEqual({ answer: null });
  });

  it('rejects verbose or non-numeric replies', () => {
    expect(unwrapAnswerText('Let me think step by step. 2 + 3 = 5, so the answer is 5.')).toBeNull();
    expect(unwrapAnswerText('the area is 6 cm2')).toBeNull();
  });
});

describe('buildSolveResult', () => {
  it('returns the validated numeric answer', () => {
    expect(buildSolveResult('52.5')).toEqual({ answer: '52.5', source: 'gemini' });
  });

  it('rejects unusable answers', async () => {
    expect(await apiErrorFrom(() => buildSolveResult('I could not solve it.'))).toMatchObject({
      status: 502,
      code: 'NO_ANSWER',
    });
  });
});
