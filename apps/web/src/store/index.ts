import { create } from 'zustand';

export type CalculatorMode = 'simple' | 'finance' | 'scan';
export type AngleMode = 'deg' | 'rad';
export type Theme = 'light' | 'dark';

interface CalculatorState {
  mode: CalculatorMode;
  angleMode: AngleMode;
  theme: Theme;
  lastAnswer: number | null;
  showScientific: boolean;
  showUnitConverter: boolean;
  showHistoryPanel: boolean;
  setMode: (mode: CalculatorMode) => void;
  setAngleMode: (mode: AngleMode) => void;
  setTheme: (theme: Theme) => void;
  setLastAnswer: (answer: number) => void;
  setShowScientific: (show: boolean) => void;
  setShowUnitConverter: (show: boolean) => void;
  setShowHistoryPanel: (show: boolean) => void;
}

export const useCalculatorStore = create<CalculatorState>((set) => ({
  mode: 'simple',
  angleMode: 'deg',
  theme: 'light',
  lastAnswer: null,
  showScientific: false,
  showUnitConverter: false,
  showHistoryPanel: false,
  setMode: (mode) => set({ mode }),
  setAngleMode: (angleMode) => set({ angleMode }),
  setTheme: (theme) => set({ theme }),
  setLastAnswer: (lastAnswer) => set({ lastAnswer }),
  setShowScientific: (showScientific) => set({ showScientific }),
  setShowUnitConverter: (showUnitConverter) => set({ showUnitConverter }),
  setShowHistoryPanel: (showHistoryPanel) => set({ showHistoryPanel }),
}));
