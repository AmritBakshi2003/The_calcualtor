import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageList } from './StageList';
import { applyStageEvent, initialStages, type StageId, type StageState } from './scanStages';

function stagesWith(id: StageId, state: StageState, detail?: string) {
  return applyStageEvent(initialStages(), { stage: id, state, detail });
}

describe('StageList', () => {
  it('renders all stages in order while running, hiding the pending Gemini row', () => {
    let stages = stagesWith('prepare', 'running');
    stages = applyStageEventsDefaults(stages);
    const { container } = render(<StageList stages={stages} />);
    const list = container.querySelector('[data-testid="scan-stages"]');
    expect(list?.getAttribute('aria-live')).toBe('polite');

    const rows = Array.from(list?.querySelectorAll('li') ?? []);
    expect(rows.map((row) => row.getAttribute('data-stage'))).toEqual([
      'prepare',
      'cache',
      'tesseract',
      'ocrspace',
      'compare',
      'final',
    ]);
    expect(screen.getByText('Preparing image')).toBeTruthy();
    expect(screen.queryByText('Gemini review')).toBeNull(); // not needed yet
  });

  it('renders each state with its marker and accessible state text', () => {
    const cases: Array<[StageId, StageState, string]> = [
      ['prepare', 'running', 'running'],
      ['cache', 'done', 'done'],
      ['tesseract', 'pending', 'pending'],
      ['ocrspace', 'skipped', 'skipped'],
      ['compare', 'failed', 'failed'],
    ];
    for (const [id, state, ariaLabel] of cases) {
      const { container, unmount } = render(<StageList stages={stagesWith(id, state)} />);
      const row = container.querySelector(`li[data-stage="${id}"]`);
      expect(row?.getAttribute('data-state')).toBe(state);
      expect(row?.textContent).toContain(ariaLabel);
      unmount();
    }
  });

  it('shows the Gemini row only once it has left pending', () => {
    const { container: pending } = render(<StageList stages={initialStages()} />);
    expect(pending.querySelector('li[data-stage="gemini"]')).toBeNull();

    const running = stagesWith('gemini', 'running');
    const { container: shown } = render(<StageList stages={running} />);
    expect(shown.querySelector('li[data-stage="gemini"]')?.getAttribute('data-state')).toBe(
      'running'
    );
  });

  it('renders plain-language detail next to the stage label', () => {
    render(
      <StageList stages={stagesWith('gemini', 'skipped', 'Gemini is busy — try again shortly.')} />
    );
    expect(screen.getByText('Gemini is busy — try again shortly.')).toBeTruthy();
  });

  it('announces stage changes: rows flip state between renders', () => {
    const { container, rerender } = render(
      <StageList stages={stagesWith('tesseract', 'running')} />
    );
    expect(container.querySelector('li[data-stage="tesseract"]')?.getAttribute('data-state')).toBe(
      'running'
    );
    rerender(<StageList stages={stagesWith('tesseract', 'done')} />);
    expect(container.querySelector('li[data-stage="tesseract"]')?.getAttribute('data-state')).toBe(
      'done'
    );
    rerender(<StageList stages={stagesWith('tesseract', 'failed', 'nothing readable')} />);
    expect(container.querySelector('li[data-stage="tesseract"]')?.getAttribute('data-state')).toBe(
      'failed'
    );
  });

  it('fits a 360px viewport: single-line rows, no horizontal overflow classes', () => {
    // The layout contract for 360px phones: rows are compact flex lines
    // (no wrapping columns), labels never wrap, detail truncates.
    const { container } = render(<StageList stages={stagesWith('gemini', 'failed', 'offline')} />);
    const firstRow = container.querySelector('li');
    expect(firstRow?.className).toContain('flex');
    expect(firstRow?.className).toContain('items-center');
    expect(firstRow?.className).toContain('min-w-0');
    const detail = container.querySelector('span[role="status"]');
    expect(detail?.className).toContain('truncate');
    const list = container.querySelector('[data-testid="scan-stages"]');
    expect(list?.className).toContain('text-xs'); // small on mobile, sm: grows
  });
});

/** A typical mid-scan snapshot used by the order test. */
function applyStageEventsDefaults(stages: ReturnType<typeof initialStages>) {
  let next = stages;
  next = applyStageEvent(next, { stage: 'prepare', state: 'running' });
  return next;
}
