/**
 * Scan progress stages (Phase 4).
 *
 * A fixed list of stages in pipeline order, each in one of five states,
 * updated by immutable events emitted from the recognition flow (the Worker
 * answers in one response, so the client emits its own events for local
 * work and maps the server's `stages` trace onto the server-side rows).
 *
 * Pure and dependency-free so the reducer is unit tested.
 */

export type StageId = 'prepare' | 'cache' | 'tesseract' | 'ocrspace' | 'compare' | 'gemini' | 'final';

export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface ScanStage {
  id: StageId;
  label: string;
  state: StageState;
  /** Short plain-language detail ("Gemini is busy — try again shortly."). */
  detail?: string;
}

/** Stages in pipeline order; the UI renders this exact order. */
export const SCAN_STAGES: ReadonlyArray<{ id: StageId; label: string }> = [
  { id: 'prepare', label: 'Preparing image' },
  { id: 'cache', label: 'Checking cache' },
  { id: 'tesseract', label: 'Tesseract' },
  { id: 'ocrspace', label: 'OCR.space' },
  { id: 'compare', label: 'Comparing results' },
  { id: 'gemini', label: 'Gemini review' },
  { id: 'final', label: 'Final check' },
];

/** All stages start pending; the Gemini row stays hidden until it is needed. */
export function initialStages(): ScanStage[] {
  return SCAN_STAGES.map(({ id, label }) => ({ id, label, state: 'pending' as StageState }));
}

export interface StageEvent {
  stage: StageId;
  state: StageState;
  detail?: string;
}

/** Apply one event immutably; unknown stage ids are ignored. */
export function applyStageEvent(stages: ScanStage[], event: StageEvent): ScanStage[] {
  return stages.map((stage) =>
    stage.id === event.stage ? { ...stage, state: event.state, detail: event.detail } : stage
  );
}

/** Apply several events in order. */
export function applyStageEvents(stages: ScanStage[], events: StageEvent[]): ScanStage[] {
  return events.reduce(applyStageEvent, stages);
}

/**
 * Map the consensus route's server-side stage trace (Phase 3 `stages`) onto
 * client events for the last three rows (Checking cache, Comparing results,
 * Gemini review). The LAST arbiter string wins — it is the arbiter's final
 * outcome. No arbiter string at all means consensus was reached and the
 * Gemini row stays pending (hidden: only needed when it is needed).
 */
export function serverStagesToEvents(serverStages: string[]): StageEvent[] {
  const events: StageEvent[] = [];
  const cacheHit = serverStages.includes('cache:hit');
  events.push({
    stage: 'cache',
    state: 'done',
    detail: cacheHit ? 'served from cache' : undefined,
  });
  events.push({ stage: 'compare', state: 'done', detail: cacheHit ? 'cached reading' : undefined });

  const arbiterStages = serverStages.filter((line) => line.startsWith('arbiter:'));
  const arbiter = arbiterStages[arbiterStages.length - 1];
  if (!arbiter) return events;

  if (arbiter === 'arbiter:skipped:busy' || arbiter.endsWith(':429:busy')) {
    events.push({ stage: 'gemini', state: 'skipped', detail: 'Gemini is busy — try again shortly.' });
  } else if (arbiter === 'arbiter:skipped:daily_cap') {
    events.push({ stage: 'gemini', state: 'skipped', detail: 'Gemini daily limit reached.' });
  } else if (arbiter === 'arbiter:skipped:not_configured') {
    events.push({ stage: 'gemini', state: 'skipped', detail: 'Gemini is not configured.' });
  } else if (arbiter === 'arbiter:skipped:image_too_large') {
    events.push({ stage: 'gemini', state: 'skipped', detail: 'image too large for review' });
  } else if (arbiter.endsWith(':error')) {
    events.push({ stage: 'gemini', state: 'failed', detail: 'Gemini review failed.' });
  } else if (arbiter.endsWith(':parse_failed')) {
    events.push({ stage: 'gemini', state: 'failed', detail: 'review answer unreadable' });
  } else if (arbiter.endsWith(':match')) {
    events.push({ stage: 'gemini', state: 'done', detail: 'confirmed the reading' });
  } else if (arbiter.endsWith(':no_match')) {
    events.push({ stage: 'gemini', state: 'done', detail: 'reviewed — no agreement' });
  } else {
    events.push({ stage: 'gemini', state: 'done' });
  }
  return events;
}
