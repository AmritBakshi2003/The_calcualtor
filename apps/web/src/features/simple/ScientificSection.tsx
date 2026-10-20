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
    // Set 0: Basic scientific functions
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
    // Set 1: Advanced functions
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
    // Set 2: Inverse hyperbolic
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

  const handleSwapSet = () => {
    setOperatorSet((prev) => (prev < operatorSets.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="mb-2 transition-all duration-300 ease-in-out">
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
        <button
          onClick={handleSwapSet}
          className="p-2 sm:p-3 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-xs sm:text-sm"
          aria-label="Swap operator set"
          title="Swap operators"
        >
          <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>
      <div className="mt-1 sm:mt-2 flex justify-center">
        <button
          onClick={() => setAngleMode(angleMode === 'deg' ? 'rad' : 'deg')}
          className={`px-3 sm:px-4 py-1 sm:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
            angleMode === 'deg'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
          }`}
          aria-label="Toggle angle mode"
        >
          {angleMode.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
