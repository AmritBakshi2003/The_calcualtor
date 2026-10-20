import { useCalculatorStore } from '../../store';

interface ScientificSectionProps {
  appendToExpression: (value: string) => void;
}

export function ScientificSection({ appendToExpression }: ScientificSectionProps) {
  const { showScientific, angleMode, setAngleMode } = useCalculatorStore();

  if (!showScientific) return null;

  const scientificFunctions = [
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
  ];

  return (
    <div className="mb-2 grid grid-cols-5 gap-1 sm:gap-2 transition-all duration-300 ease-in-out">
      {scientificFunctions.map((func) => (
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
    </div>
  );
}
