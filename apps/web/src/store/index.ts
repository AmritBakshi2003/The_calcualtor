import { create } from 'zustand';

export type CalculatorMode = 'simple' | 'scientific' | 'finance' | 'scan';
export type AngleMode = 'deg' | 'rad';
export type Theme = 'light' | 'dark';

interface CalculatorState {
  mode: CalculatorMode;
  angleMode: AngleMode;
  theme: Theme;
  lastAnswer: number | null;
  setMode: (mode: CalculatorMode) => void;
  setAngleMode: (mode: AngleMode) => void;
  setTheme: (theme: Theme) => void;
  setLastAnswer: (answer: number) => void;
}

export const useCalculatorStore = create<CalculatorState>((set) => ({
  mode: 'simple',
  angleMode: 'deg',
  theme: 'light',
  lastAnswer: null,
  setMode: (mode) => set({ mode }),
  setAngleMode: (angleMode) => set({ angleMode }),
  setTheme: (theme) => set({ theme }),
  setLastAnswer: (lastAnswer) => set({ lastAnswer }),
}));
