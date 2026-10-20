import { useScientific } from './useScientific';
import { SimpleCalculator } from '../simple/SimpleCalculator';
import { useCalculatorStore } from '../../store';

export function ScientificCalculator() {
  const { appendToExpression } = useScientific();
  const { angleMode, setAngleMode } = useCalculatorStore();

  const scientificFunctions = [
    { label: 'sin', value: 'sin(' },
    { label: 'cos', value: 'cos(' },
    { label: 'tan', value: 'tan(' },
    { label: 'log', value: 'log(' },
    { label: 'ln', value: 'ln(' },
    { label: '√', value: 'sqrt(' },
    { label: '^', value: '^' },
    { label: 'π', value: 'pi' },
    { label: 'e', value: 'e' },
    { label: '!', value: 'factorial(' },
    { label: 'abs', value: 'abs(' },
    { label: '%', value: '%' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Angle Mode:
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setAngleMode('deg')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                angleMode === 'deg'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
              aria-label="Switch to degree mode"
            >
              DEG
            </button>
            <button
              onClick={() => setAngleMode('rad')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                angleMode === 'rad'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
              aria-label="Switch to radian mode"
            >
              RAD
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Scientific functions panel */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4">
          <div className="grid grid-cols-3 gap-2">
            {scientificFunctions.map((func) => (
              <button
                key={func.label}
                onClick={() => appendToExpression(func.value)}
                className="p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                aria-label={func.label}
              >
                {func.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main calculator */}
        <div className="lg:col-span-2">
          <SimpleCalculator />
        </div>
      </div>
    </div>
  );
}
