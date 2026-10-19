import { useState, useCallback, useEffect } from 'react';
import { evaluateExpression, EvaluateOptions } from '@calculator-suite/math-core';
import { useCalculatorStore } from '../../store';
import { addHistoryEntry } from '../../storage/db';

export function useCalculator() {
  const { mode, angleMode, lastAnswer, setLastAnswer } = useCalculatorStore();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState(0);

  const appendToExpression = useCallback((value: string) => {
    setError(null);
    setExpression((prev) => prev + value);
  }, []);

  const clear = useCallback(() => {
    setExpression('');
    setResult(null);
    setError(null);
  }, []);

  const clearEntry = useCallback(() => {
    setExpression('');
    setError(null);
  }, []);

  const backspace = useCallback(() => {
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const evaluate = useCallback(async () => {
    if (!expression) return;

    const options: EvaluateOptions = {
      angleMode,
      lastAnswer: lastAnswer ?? undefined,
    };

    const evalResult = evaluateExpression(expression, options);

    if (evalResult.success) {
      const numResult = evalResult.result as number;
      const resultStr = numResult.toString();
      setResult(resultStr);
      setLastAnswer(numResult);
      setError(null);

      // Save to history
      await addHistoryEntry({
        mode,
        expression,
        result: resultStr,
        timestamp: Date.now(),
      });
    } else {
      setError(evalResult.error || 'Error');
      setResult(null);
    }
  }, [expression, angleMode, lastAnswer, setLastAnswer, mode]);

  const memoryRecall = useCallback(() => {
    appendToExpression(memory.toString());
  }, [memory, appendToExpression]);

  const memoryClear = useCallback(() => {
    setMemory(0);
  }, []);

  const memoryAdd = useCallback(async () => {
    if (!expression) return;
    const evalResult = evaluateExpression(expression, { angleMode });
    if (evalResult.success) {
      setMemory((prev) => prev + (evalResult.result as number));
      clearEntry();
    }
  }, [expression, angleMode, clearEntry]);

  const memorySubtract = useCallback(async () => {
    if (!expression) return;
    const evalResult = evaluateExpression(expression, { angleMode });
    if (evalResult.success) {
      setMemory((prev) => prev - (evalResult.result as number));
      clearEntry();
    }
  }, [expression, angleMode, clearEntry]);

  const toggleSign = useCallback(() => {
    setExpression((prev) => {
      if (!prev) return '-';
      if (prev.startsWith('-')) return prev.slice(1);
      return '-' + prev;
    });
  }, []);

  const toggleAngleMode = useCallback(() => {
    setAngleMode(angleMode === 'deg' ? 'rad' : 'deg');
  }, [angleMode, setAngleMode]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/[0-9.]/.test(e.key)) {
        appendToExpression(e.key);
      } else if (['+', '-', '*', '/', '%', '(', ')'].includes(e.key)) {
        appendToExpression(e.key);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        evaluate();
      } else if (e.key === 'Backspace') {
        backspace();
      } else if (e.key === 'Escape') {
        clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appendToExpression, evaluate, backspace, clear]);

  return {
    expression,
    result,
    error,
    memory,
    appendToExpression,
    clear,
    clearEntry,
    backspace,
    evaluate,
    memoryRecall,
    memoryClear,
    memoryAdd,
    memorySubtract,
    toggleSign,
    toggleAngleMode,
  };
}
