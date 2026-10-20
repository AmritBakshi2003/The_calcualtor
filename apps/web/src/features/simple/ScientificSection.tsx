import { useState } from 'react';
import { useCalculatorStore } from '../../store';

interface ScientificSectionProps {
  appendToExpression: (value: string) => void;
}

export function ScientificSection({ appendToExpression }: ScientificSectionProps) {
  const { showScientific, angleMode, setAngleMode } = useCalculatorStore();
  const [operatorSet, setOperatorSet] = useState(0);

  if (!showScientific) return null;

  const operatorSets = [
    // Set 0: Basic trig and common functions
    [
      { label: 'sin', value: 'sin(' },
      { label: 'cos', value: 'cos(' },
      { label: 'tan', value: 'tan(' },
      { label: 'ln', value: 'ln(' },
      { label: 'log', value: 'log(' },
      { label: 'sqrt', value: 'sqrt(' },
      { label: 'x^y', value: '^' },
      { label: 'x!', value: 'factorial(' },
      { label: 'π', value: 'pi' },
      { label: 'e', value: 'e' },
    ],
    // Set 1: Inverse trig, powers, hyperbolic
    [
      { label: 'sin⁻¹', value: 'asin(' },
      { label: 'cos⁻¹', value: 'acos(' },
      { label: 'tan⁻¹', value: 'atan(' },
      { label: '2ˣ', value: '2^' },
      { label: 'x³', value: '^3' },
      { label: '³√', value: 'cbrt(' },
      { label: 'sinh', value: 'sinh(' },
      { label: 'cosh', value: 'cosh(' },
      { label: 'tanh', value: 'tanh(' },
      { label: 'x²', value: '^2' },
    ],
    // Set 2: Inverse hyperbolic, exponential, logarithms
    [
      { label: 'sinh⁻¹', value: 'asinh(' },
      { label: 'cosh⁻¹', value: 'acosh(' },
      { label: 'tanh⁻¹', value: 'atanh(' },
      { label: '10ˣ', value: '10^' },
      { label: 'eˣ', value: 'e^' },
      { label: 'log₂', value: 'log2(' },
      { label: 'log₁₀', value: 'log10(' },
      { label: '1/x', value: '1/' },
      { label: 'abs', value: 'abs(' },
      { label: 'nCr', value: 'nCr(' },
    ],
  ];

  const currentSet = operatorSets[operatorSet];

  return (
    <div className="mb-2 space-y-2 transition-all duration-300 ease-in-out">
      <div className="flex justify-between items-center gap-2">
        <button
          onClick={() => setAngleMode(angleMode === 'deg' ? 'rad' : 'deg')}
          className={`p-2 sm:p-3 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
            angleMode === 'deg'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
          }`}
          aria-label="Toggle angle mode"
        >
          {angleMode.toUpperCase()}
        </button>
        <button
          onClick={() => setOperatorSet((prev) => (prev < operatorSets.length - 1 ? prev + 1 : 0))}
          className="p-2 sm:p-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors text-xs sm:text-sm flex items-center justify-center"
          aria-label="Swap operator set"
          title="Swap operators"
        >
          <svg
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        {currentSet.map((func) => (
          <button
            key={func.label}
            onClick={() => appendToExpression(func.value)}
            className="p-2 sm:p-3 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-xs sm:text-sm"
            aria-label={func.label}
          >
            {func.label}
          </button>
        ))}
      </div>
    </div>
  );
}
