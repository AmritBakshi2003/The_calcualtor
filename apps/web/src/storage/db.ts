import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface HistoryEntry {
  id?: number;
  mode: 'simple' | 'scientific' | 'finance' | 'scan';
  expression: string;
  result: string;
  timestamp: number;
}

export interface Settings {
  theme: 'light' | 'dark';
  angleMode: 'deg' | 'rad';
  numberFormat: 'standard' | 'indian';
  lastMode: 'simple' | 'scientific' | 'finance' | 'scan';
}

interface CalculatorDB extends DBSchema {
  history: {
    key: number;
    value: HistoryEntry;
    indexes: {
      'by-timestamp': number;
      'by-mode': string;
    };
  };
  settings: {
    key: 'default';
    value: Settings;
  };
}

const DB_NAME = 'CalculatorSuiteDB';
const DB_VERSION = 1;

let db: IDBPDatabase<CalculatorDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CalculatorDB>> {
  if (db) return db;

  db = await openDB<CalculatorDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create history store
      const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      historyStore.createIndex('by-timestamp', 'timestamp');
      historyStore.createIndex('by-mode', 'mode');

      // Create settings store
      db.createObjectStore('settings', { keyPath: 'id' });
    },
  });

  return db;
}

export async function addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): Promise<number> {
  const database = await getDB();
  return database.add('history', entry);
}

export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  const database = await getDB();
  return database.getAll('history', undefined, limit);
}

export async function getHistoryByMode(mode: string, limit = 50): Promise<HistoryEntry[]> {
  const database = await getDB();
  const index = database.transaction('history').store.index('by-mode');
  return index.getAll(mode, limit);
}

export async function searchHistory(query: string): Promise<HistoryEntry[]> {
  const database = await getDB();
  const allHistory = await database.getAll('history');
  const lowerQuery = query.toLowerCase();
  return allHistory.filter(
    (entry) =>
      entry.expression.toLowerCase().includes(lowerQuery) ||
      entry.result.toLowerCase().includes(lowerQuery)
  );
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  const database = await getDB();
  await database.delete('history', id);
}

export async function clearHistory(): Promise<void> {
  const database = await getDB();
  await database.clear('history');
}

export async function exportHistoryToCSV(): Promise<string> {
  const history = await getHistory();
  const headers = ['Mode', 'Expression', 'Result', 'Timestamp'];
  const rows = history.map((entry) => [
    entry.mode,
    entry.expression,
    entry.result,
    new Date(entry.timestamp).toISOString(),
  ]);

  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  return csv;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const database = await getDB();
  await database.put('settings', settings);
}

export async function getSettings(): Promise<Settings | undefined> {
  const database = await getDB();
  return database.get('settings', 'default');
}

export async function clearSettings(): Promise<void> {
  const database = await getDB();
  await database.delete('settings', 'default');
}
