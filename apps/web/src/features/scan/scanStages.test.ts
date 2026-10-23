import { describe, expect, it } from 'vitest';
import {
  SCAN_STAGES,
  applyStageEvent,
  applyStageEvents,
  initialStages,
  serverStagesToEvents,
  type StageState,
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

describe('serverStagesToEvents', () => {
  it('marks the cache and compare rows done; consensus leaves Gemini untouched', () => {
    const events = serverStagesToEvents(['cache:miss', 'decide:consensus']);
    expect(events).toEqual([
      { stage: 'cache', state: 'done', detail: undefined },
      { stage: 'compare', state: 'done', detail: undefined },
    ]);
  });

  it('labels a cache hit', () => {
    const events = serverStagesToEvents(['cache:hit', 'decide:consensus']);
    expect(events[0]).toEqual({ stage: 'cache', state: 'done', detail: 'served from cache' });
  });

  it('maps each arbiter outcome onto the Gemini row', () => {
    const cases: Array<[string, StageState, string?]> = [
      ['arbiter:gemini-3.5-flash-lite:match', 'done', 'confirmed the reading'],
      ['arbiter:gemini-3.8-flash:no_match', 'done', 'reviewed — no agreement'],
      ['arbiter:gemini-3.5-flash-lite:429:busy', 'skipped', 'Gemini is busy — try again shortly.'],
      ['arbiter:skipped:busy', 'skipped', 'Gemini is busy — try again shortly.'],
      ['arbiter:skipped:daily_cap', 'skipped', 'Gemini daily limit reached.'],
      ['arbiter:skipped:not_configured', 'skipped', 'Gemini is not configured.'],
      ['arbiter:skipped:image_too_large', 'skipped', 'image too large for review'],
      ['arbiter:gemini-3.8-flash:error', 'failed', 'Gemini review failed.'],
      ['arbiter:gemini-3.5-flash-lite:parse_failed', 'failed', 'review answer unreadable'],
    ];
    for (const [serverStage, state, detail] of cases) {
      const events = serverStagesToEvents(['cache:miss', 'decide:needs_arbiter', serverStage]);
      expect(events[2]).toEqual({ stage: 'gemini', state, detail });
    }
  });

  it('the LAST arbiter string is the final outcome', () => {
    const events = serverStagesToEvents([
      'cache:miss',
      'decide:needs_arbiter',
      'arbiter:gemini-3.5-flash-lite:no_match',
      'arbiter:gemini-3.8-flash:match',
    ]);
    expect(events[2]).toMatchObject({ state: 'done', detail: 'confirmed the reading' });
  });
});
