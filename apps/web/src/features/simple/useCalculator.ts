import { useState, useCallback, useEffect } from 'react';
import { evaluateExpression, EvaluateOptions } from '@calculator-suite/math-core';
import { useCalculatorStore } from '../../store';
import { addHistoryEntry } from '../../storage/db';
import { appendSmart } from './smartAppend';

export function useCalculator() {
  const { mode, angleMode, lastAnswer, setLastAnswer } = useCalculatorStore();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState(0);

  const appendToExpression = useCallback((value: string) => {
    setError(null);
    setExpression((prev) => appendSmart(prev, value));
  }, []);

  const clear = useCallback(() => {
    setExpression('');
    setResult(null);
    setError(null);
  }, []);

  const backspace = useCallback(() => {
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  /** Load a full expression (history reuse); restoring a known result is optional. */
  const loadExpression = useCallback((expr: string, initialResult?: string | null) => {
    setExpression(expr);
    setResult(initialResult ?? null);
    setError(null);
  }, []);

  const evaluate = useCallback(async () => {
    if (!expression) return;

    // Auto-close unmatched parentheses
    let expressionToEvaluate = expression;
    const openParens = (expressionToEvaluate.match(/\(/g) || []).length;
    const closeParens = (expressionToEvaluate.match(/\)/g) || []).length;
    if (openParens > closeParens) {
      expressionToEvaluate += ')'.repeat(openParens - closeParens);
    }

    const options: EvaluateOptions = {
      angleMode,
      lastAnswer: lastAnswer ?? undefined,
    };

    const evalResult = evaluateExpression(expressionToEvaluate, options);

    if (evalResult.success) {
      const numResult = evalResult.result as number;
      const resultStr = numResult.toString();
      setResult(resultStr);
      setLastAnswer(numResult);
      setError(null);

      // Save to history
      await addHistoryEntry({
        mode,
        expression: expressionToEvaluate,
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
      setExpression('');
    }
  }, [expression, angleMode]);

  const memorySubtract = useCallback(async () => {
    if (!expression) return;
    const evalResult = evaluateExpression(expression, { angleMode });
    if (evalResult.success) {
      setMemory((prev) => prev - (evalResult.result as number));
      setExpression('');
    }
  }, [expression, angleMode]);

  const toggleSign = useCallback(() => {
    setExpression((prev) => {
      if (!prev) return '-';
      if (prev.startsWith('-')) return prev.slice(1);
      return '-' + prev;
    });
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never hijack typing in other controls (Tip %, Scan box, Finance fields).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Let browser/app shortcuts through.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

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
    angleMode,
    appendToExpression,
    clear,
    backspace,
    loadExpression,
    evaluate,
    memoryRecall,
    memoryClear,
    memoryAdd,
    memorySubtract,
    toggleSign,
    setResult,
    setError,
  };
}
