import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * "New version available" banner.
 *
 * The service worker used to update silently, so a deployed app could keep
 * running the previous JavaScript bundle until the user happened to reload:
 * the site looked current while the scan tab was still the old OCR pipeline.
 * Dev never shows this because the dev server registers no service worker at
 * all — which is exactly why the same image scanned correctly on localhost
 * and not in production. Making the update visible (and one click away) keeps
 * production in step with the deployed code.
 */
export function PwaUpdateBanner() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check hourly instead of relying on the browser's own update cadence,
      // which can be much longer on mobile.
      registration?.update().catch(() => undefined);
    },
  });

  const [updateAvailable, setUpdateAvailable] = needRefresh;

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 bg-slate-900/95 text-white shadow-lg"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <p className="text-sm flex-1">A new version of the calculator is ready.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setUpdateAvailable(false)}
            className="px-3 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            Later
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors font-medium"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
