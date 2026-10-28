import { describe, expect, it } from 'vitest';
import { RECOGNIZE_SYSTEM_INSTRUCTION, VERIFY_SYSTEM_INSTRUCTION } from '../src/prompts';

/**
 * Step-5 prompt contract: these exact reading rules and the JSON output
 * shape are what fix P1/P2/P3 on real screenshots, so they are asserted
 * rather than left to drift silently.
 */
describe('RECOGNIZE_SYSTEM_INSTRUCTION (step 5)', () => {
  it('carries the exact reading rules from the plan', () => {
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain(
      'Read the math expression EXACTLY as written, left-to-right, top-to-bottom.'
    );
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain(
      'A long expression may wrap across lines: return ONE expression.'
    );
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain('Handwriting is common: be careful with 1/7, 0/6, 4/9, 5/S.');
  });

  it('keeps the display symbols in the output', () => {
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain('√, π, ², ³, ^, %, ÷, ×');
  });

  it('declares the JSON contract with uncertain, and UNREADABLE as bare escape', () => {
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain(
      '{"expression": string, "uncertain": [{"index": number, "char": string, "alternatives": [string, ...]}]}'
    );
    expect(RECOGNIZE_SYSTEM_INSTRUCTION).toContain('answer with the single word UNREADABLE (bare, not JSON)');
  });
});

describe('VERIFY_SYSTEM_INSTRUCTION (unchanged contract)', () => {
  it('still answers with a bare expression or UNREADABLE', () => {
    expect(VERIFY_SYSTEM_INSTRUCTION).toContain('Output ONLY the expression string (or the single word UNREADABLE).');
  });
});
