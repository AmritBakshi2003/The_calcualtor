import { ReactNode, useState, useEffect } from 'react';
import { useCalculatorStore, CalculatorMode } from '../store';
import { HistoryPanel } from '../features/history/HistoryPanel';
import { HistoryEntry } from '../storage/db';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { mode, setMode, theme, setTheme } = useCalculatorStore();
  const [showHistory, setShowHistory] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const modes: { key: CalculatorMode; label: string }[] = [
    { key: 'simple', label: 'Simple' },
    { key: 'scientific', label: 'Scientific' },
    { key: 'finance', label: 'Finance' },
    { key: 'scan', label: 'Scan' },
  ];

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleHistorySelect = (entry: HistoryEntry) => {
    // TODO: Load the expression into the appropriate calculator
    console.log('Selected history entry:', entry);
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <header className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Calculator Suite
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="View history"
              >
                📜
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
            </div>
          </div>
        </header>

        {!isOnline && (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-300 dark:border-yellow-700 px-4 py-2">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
              ⚠️ You are offline. {mode === 'scan' ? 'Scanner feature requires OCR library (may be cached).' : 'Core calculators work offline.'}
            </p>
          </div>
        )}

        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex space-x-1 overflow-x-auto py-2">
              {modes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    mode === m.key
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  aria-label={`Switch to ${m.label} calculator`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      </div>

      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectEntry={handleHistorySelect}
      />
    </div>
  );
}
