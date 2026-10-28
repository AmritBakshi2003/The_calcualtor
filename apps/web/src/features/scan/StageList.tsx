/**
 * Scan progress list (Phase 4).
 *
 * Renders the pipeline stages with a plain marker per state:
 *   pending (○) · running (◍ animated) · done (✓) · skipped (—) · failed (✕)
 *
 * Accessibility: the list container is aria-live="polite" so screen readers
 * announce stage changes while the scan keeps running. Row labels are fixed;
 * `detail` (plain language, e.g. the skip reason) is appended as a secondary
 * span. Compact single-line rows that fit 360px-wide phones.
 */

import type { ScanStage, StageState } from './scanStages';

const STATE_MARKERS: Record<StageState, { label: string; className: string; glyph: string }> = {
  pending: { label: 'pending', className: 'text-gray-400 dark:text-gray-500', glyph: '○' },
  running: {
    label: 'running',
    className: 'text-blue-600 dark:text-blue-400 animate-pulse',
    glyph: '◍',
  },
  done: { label: 'done', className: 'text-green-600 dark:text-green-400', glyph: '✓' },
  skipped: { label: 'skipped', className: 'text-gray-500 dark:text-gray-400', glyph: '—' },
  failed: { label: 'failed', className: 'text-red-600 dark:text-red-400', glyph: '✕' },
};

export function StageList({ stages }: { stages: ScanStage[] }) {
  // The Gemini row only appears once it has actually started running (or
  // finished) — the spec's "only if needed".
  const visible = stages.filter(
    (stage) => stage.id !== 'gemini' || stage.state !== 'pending'
  );

  return (
    <ol
      data-testid="scan-stages"
      aria-live="polite"
      aria-relevant="text"
      className="mt-3 space-y-1 text-xs sm:text-sm"
    >
      {visible.map((stage) => {
        const marker = STATE_MARKERS[stage.state];
        return (
          <li key={stage.id} className="flex items-center gap-2 min-w-0" data-stage={stage.id} data-state={stage.state}>
            <span aria-hidden="true" className={`w-4 flex-shrink-0 ${marker.className}`}>
              {marker.glyph}
            </span>
            <span aria-hidden="true" className="sr-only">{marker.label}. </span>
            <span className="font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
              {stage.label}
            </span>
            {stage.detail && (
              <span className="ml-2 truncate text-gray-500 dark:text-gray-400" role="status">
                {stage.detail}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
