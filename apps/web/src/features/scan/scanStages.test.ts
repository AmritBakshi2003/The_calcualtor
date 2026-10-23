import { describe, expect, it } from 'vitest';
import {
  SCAN_STAGES,
  applyStageEvent,
  applyStageEvents,
  initialStages,
} from './scanStages';

describe('scanStages', () => {
  it('starts every stage pending, in pipeline order', () => {
    const stages = initialStages();
    expect(stages.map((s) => s.id)).toEqual([
      'prepare',
      'cache',
      'tesseract',
      'ocrspace',
      'compare',
      'gemini',
      'final',
    ]);
    expect(stages.every((s) => s.state === 'pending')).toBe(true);
    expect(SCAN_STAGES.map((s) => s.label)).toEqual([
      'Preparing image',
      'Checking cache',
      'Tesseract',
      'OCR.space',
      'Comparing results',
      'Gemini review',
      'Final check',
    ]);
  });

  it('applies one event to the matching stage only', () => {
    const stages = applyStageEvent(initialStages(), { stage: 'tesseract', state: 'running' });
    expect(stages.find((s) => s.id === 'tesseract')?.state).toBe('running');
    expect(stages.find((s) => s.id === 'prepare')?.state).toBe('pending');
  });

  it('carries a plain-language detail with the state', () => {
    const stages = applyStageEvent(initialStages(), {
      stage: 'gemini',
      state: 'skipped',
      detail: 'Gemini is busy — try again shortly.',
    });
    expect(stages.find((s) => s.id === 'gemini')).toMatchObject({
      state: 'skipped',
      detail: 'Gemini is busy — try again shortly.',
    });
  });

  it('does not mutate the input array', () => {
    const before = initialStages();
    const snapshot = before.map((s) => ({ ...s }));
    applyStageEvent(before, { stage: 'prepare', state: 'done' });
    expect(before).toEqual(snapshot);
  });

  it('ignores unknown stage ids', () => {
    const before = initialStages();
    const after = applyStageEvent(before, { stage: 'nonexistent' as never, state: 'done' });
    expect(after).toEqual(before);
  });

  it('applies multiple events in order (last one wins per stage)', () => {
    const stages = applyStageEvents(initialStages(), [
      { stage: 'ocrspace', state: 'running' },
      { stage: 'ocrspace', state: 'skipped', detail: 'not configured' },
      { stage: 'prepare', state: 'done' },
    ]);
    expect(stages.find((s) => s.id === 'ocrspace')).toMatchObject({
      state: 'skipped',
      detail: 'not configured',
    });
    expect(stages.find((s) => s.id === 'prepare')?.state).toBe('done');
  });
});
