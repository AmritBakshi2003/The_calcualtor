import { useState, useCallback } from 'react';
import { apiClient, ApiRequestError } from './client';
import { evaluateExpression } from '@calculator-suite/math-core';

interface UseApiCalculateResult {
  isLoading: boolean;
  error: string | null;
  calculate: (expression: string, angleMode?: 'deg' | 'rad', lastAnswer?: number) => Promise<number | string>;
  isApiAvailable: boolean;
}

export function useApiCalculate(): UseApiCalculateResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(
    async (
      expression: string,
      angleMode: 'deg' | 'rad' = 'deg',
      lastAnswer?: number
    ): Promise<number | string> => {
      setIsLoading(true);
      setError(null);

      try {
        // Try API first if configured
        if (apiClient.isConfigured()) {
          try {
            const result = await apiClient.calculate({
              expression,
              angleMode,
              lastAnswer,
            });

            if (result.success && result.result !== undefined) {
              return result.result;
            }
          } catch (apiError) {
            if (apiError instanceof ApiRequestError) {
              // Log API error but fall back to local calculation
              console.warn('API calculation failed, falling back to local:', apiError.message);
              // Don't set error for user - we'll fallback gracefully
            }
          }
        }

        // Fallback to local calculation
        const localResult = evaluateExpression(expression, {
          angleMode,
          lastAnswer,
        });

        if (!localResult.success) {
          throw new Error(localResult.error || 'Calculation failed');
        }

        return localResult.result as number | string;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Calculation failed';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    calculate,
    isApiAvailable: apiClient.isConfigured(),
  };
}
