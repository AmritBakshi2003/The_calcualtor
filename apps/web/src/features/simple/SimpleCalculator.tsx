import { useCalculator } from './useCalculator';

export function SimpleCalculator() {
  const {
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
  } = useCalculator();

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        {/* Display */}
        <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg min-h-[120px] flex flex-col justify-end items-end">
          {expression && (
            <div className="text-gray-600 dark:text-gray-400 text-sm mb-2" aria-live="polite">
              {expression}
            </div>
          )}
          {error && (
            <div className="text-red-500 dark:text-red-400 text-lg font-medium" role="alert">
              {error}
            </div>
          )}
          {result && !error && (
            <div className="text-3xl font-bold text-gray-900 dark:text-white" aria-live="polite">
              {result}
            </div>
          )}
          {!result && !error && !expression && (
            <div className="text-gray-400 dark:text-gray-500 text-2xl">0</div>
          )}
        </div>

        {/* Memory indicator */}
        {memory !== 0 && (
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            M: {memory}
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          {/* Row 1: Memory keys */}
          <button
            onClick={memoryClear}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="MC"
          >
            MC
          </button>
          <button
            onClick={memoryRecall}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="MR"
          >
            MR
          </button>
          <button
            onClick={memoryAdd}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="M+"
          >
            M+
          </button>
          <button
            onClick={memorySubtract}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="M-"
          >
            M-
          </button>

          {/* Row 2: Clear and backspace */}
          <button
            onClick={clear}
            className="p-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
            aria-label="Clear All"
          >
            C
          </button>
          <button
            onClick={clearEntry}
            className="p-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
            aria-label="Clear Entry"
          >
            CE
          </button>
          <button
            onClick={backspace}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="Backspace"
          >
            ⌫
          </button>
          <button
            onClick={() => appendToExpression('/')}
            className="p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            aria-label="Divide"
          >
            ÷
          </button>

          {/* Row 3: 7, 8, 9, multiply */}
          <button
            onClick={() => appendToExpression('7')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="7"
          >
            7
          </button>
          <button
            onClick={() => appendToExpression('8')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="8"
          >
            8
          </button>
          <button
            onClick={() => appendToExpression('9')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="9"
          >
            9
          </button>
          <button
            onClick={() => appendToExpression('*')}
            className="p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            aria-label="Multiply"
          >
            ×
          </button>

          {/* Row 4: 4, 5, 6, subtract */}
          <button
            onClick={() => appendToExpression('4')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="4"
          >
            4
          </button>
          <button
            onClick={() => appendToExpression('5')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="5"
          >
            5
          </button>
          <button
            onClick={() => appendToExpression('6')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="6"
          >
            6
          </button>
          <button
            onClick={() => appendToExpression('-')}
            className="p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            aria-label="Subtract"
          >
            −
          </button>

          {/* Row 5: 1, 2, 3, add */}
          <button
            onClick={() => appendToExpression('1')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="1"
          >
            1
          </button>
          <button
            onClick={() => appendToExpression('2')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="2"
          >
            2
          </button>
          <button
            onClick={() => appendToExpression('3')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="3"
          >
            3
          </button>
          <button
            onClick={() => appendToExpression('+')}
            className="p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            aria-label="Add"
          >
            +
          </button>

          {/* Row 6: 0, decimal, sign, equals */}
          <button
            onClick={() => appendToExpression('0')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="0"
          >
            0
          </button>
          <button
            onClick={() => appendToExpression('.')}
            className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="Decimal point"
          >
            .
          </button>
          <button
            onClick={toggleSign}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="Toggle sign"
          >
            ±
          </button>
          <button
            onClick={evaluate}
            className="p-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
            aria-label="Equals"
          >
            =
          </button>

          {/* Row 7: parentheses and percent */}
          <button
            onClick={() => appendToExpression('(')}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="Left parenthesis"
          >
            (
          </button>
          <button
            onClick={() => appendToExpression(')')}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            aria-label="Right parenthesis"
          >
            )
          </button>
          <button
            onClick={() => appendToExpression('%')}
            className="p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors col-span-2"
            aria-label="Percent"
          >
            %
          </button>
        </div>
      </div>
    </div>
  );
}
