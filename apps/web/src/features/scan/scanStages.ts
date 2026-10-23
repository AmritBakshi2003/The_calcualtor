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
