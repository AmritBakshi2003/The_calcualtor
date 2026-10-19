import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiCalculate } from './useApiCalculate';
import { evaluateExpression } from '@calculator-suite/math-core';

// Mock math-core
vi.mock('@calculator-suite/math-core', () => ({
  evaluateExpression: vi.fn(),
}));

describe('useApiCalculate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use local calculation when API is not configured', async () => {
    // Mock process.env to not have API_BASE_URL
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    (import.meta.env as any).VITE_API_BASE_URL = undefined;

    vi.mocked(evaluateExpression).mockReturnValue({
      success: true,
      result: 14,
    });

    const { result } = renderHook(() => useApiCalculate());

    expect(result.current.isApiAvailable).toBe(false);

    let calculationResult;
    await act(async () => {
      calculationResult = await result.current.calculate('2 + 3 * 4');
    });

    expect(calculationResult).toBe(14);
    expect(evaluateExpression).toHaveBeenCalledWith('2 + 3 * 4', {
      angleMode: 'deg',
      lastAnswer: undefined,
    });

    (import.meta.env as any).VITE_API_BASE_URL = originalEnv;
  });

  it('should handle local calculation errors', async () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    (import.meta.env as any).VITE_API_BASE_URL = undefined;

    vi.mocked(evaluateExpression).mockReturnValue({
      success: false,
      error: 'Invalid expression',
    });

    const { result } = renderHook(() => useApiCalculate());

    await expect(
      act(async () => {
        await result.current.calculate('2 + * 3');
      })
    ).rejects.toThrow('Invalid expression');

    (import.meta.env as any).VITE_API_BASE_URL = originalEnv;
  });

  it('should support angle mode parameter', async () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    (import.meta.env as any).VITE_API_BASE_URL = undefined;

    vi.mocked(evaluateExpression).mockReturnValue({
      success: true,
      result: 1,
    });

    const { result } = renderHook(() => useApiCalculate());

    await act(async () => {
      await result.current.calculate('sin(90)', 'rad');
    });

    expect(evaluateExpression).toHaveBeenCalledWith('sin(90)', {
      angleMode: 'rad',
      lastAnswer: undefined,
    });

    (import.meta.env as any).VITE_API_BASE_URL = originalEnv;
  });

  it('should support lastAnswer parameter', async () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    (import.meta.env as any).VITE_API_BASE_URL = undefined;

    vi.mocked(evaluateExpression).mockReturnValue({
      success: true,
      result: 20,
    });

    const { result } = renderHook(() => useApiCalculate());

    await act(async () => {
      await result.current.calculate('Ans + 5', 'deg', 15);
    });

    expect(evaluateExpression).toHaveBeenCalledWith('Ans + 5', {
      angleMode: 'deg',
      lastAnswer: 15,
    });

    (import.meta.env as any).VITE_API_BASE_URL = originalEnv;
  });
});
