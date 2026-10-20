import { useState, useEffect } from 'react';
import {
  getHistory,
  deleteHistoryEntry,
  clearHistory,
  searchHistory,
  exportHistoryToCSV,
  HistoryEntry,
} from '../../storage/db';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntry: (entry: HistoryEntry) => void;
}

export function HistoryPanel({ isOpen, onClose, onSelectEntry }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredHistory, setFilteredHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchQuery) {
      performSearch();
    } else {
      setFilteredHistory(history);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, history]);

  const loadHistory = async () => {
    const entries = await getHistory();
    setHistory(entries.reverse()); // Show newest first
    setFilteredHistory(entries.reverse());
  };

  const performSearch = async () => {
    if (searchQuery) {
      const results = await searchHistory(searchQuery);
      setFilteredHistory(results.reverse());
    } else {
      setFilteredHistory(history);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteHistoryEntry(id);
    await loadHistory();
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all history?')) {
      await clearHistory();
      await loadHistory();
    }
  };

  const handleExport = async () => {
    const csv = await exportHistoryToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calculator-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelect = (entry: HistoryEntry) => {
    onSelectEntry(entry);
    // Don't close panel - allow continued use
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-80 sm:w-96 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out z-50">
      <div className="h-full flex flex-col">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">History</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close history"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 sm:gap-2 mb-3 sm:mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history..."
              className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs sm:text-sm"
            />
          </div>

          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={handleExport}
              className="flex-1 px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-xs sm:text-sm"
            >
              Export
            </button>
            <button
              onClick={handleClearAll}
              className="flex-1 px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors text-xs sm:text-sm"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredHistory.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              {searchQuery ? 'No matching history found' : 'No history yet'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {entry.mode.toUpperCase()} • {formatDate(entry.timestamp)}
                      </div>
                      <div className="font-mono text-gray-900 dark:text-white mb-1 text-sm">
                        {entry.expression}
                      </div>
                      <div className="font-mono text-green-600 dark:text-green-400 font-medium text-sm">
                        = {entry.result}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2 sm:ml-4">
                      <button
                        onClick={() => handleSelect(entry)}
                        className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                        aria-label="Use this entry"
                      >
                        ↩
                      </button>
                      <button
                        onClick={() => entry.id && handleDelete(entry.id)}
                        className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                        aria-label="Delete this entry"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
