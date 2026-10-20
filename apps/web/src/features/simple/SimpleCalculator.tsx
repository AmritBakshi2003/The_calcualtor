import { useCalculator } from './useCalculator';
import { useCalculatorStore } from '../../store';
import { ScientificSection } from './ScientificSection';
import { useState } from 'react';

const categories = [
  'Length',
  'Area',
  'Temperature',
  'Volume',
  'Mass',
  'Data',
  'Speed',
  'Time',
  'Tip',
];

const units: Record<string, string[]> = {
  Length: ['km', 'm', 'cm', 'mm', 'mile', 'yard', 'ft', 'in'],
  Area: ['km²', 'm²', 'cm²', 'mm²', 'mile²', 'yard²', 'ft²', 'in²'],
  Temperature: ['Celsius', 'Fahrenheit', 'Kelvin'],
  Volume: ['L', 'mL', 'gal', 'qt', 'pt', 'cup', 'fl oz'],
  Mass: ['kg', 'g', 'mg', 'lb', 'oz', 'ton'],
  Data: ['TB', 'GB', 'MB', 'KB', 'B'],
  Speed: ['km/h', 'm/s', 'mph', 'ft/s'],
  Time: ['s', 'min', 'h', 'day', 'week', 'month', 'year'],
  Tip: ['%'],
};

// Conversion factors to base unit (meters for length, etc.)
const conversionFactors: Record<string, Record<string, number>> = {
  Length: {
    km: 1000,
    m: 1,
    cm: 0.01,
    mm: 0.001,
    mile: 1609.344,
    yard: 0.9144,
    ft: 0.3048,
    in: 0.0254,
  },
  Area: {
    'km²': 1000000,
    'm²': 1,
    'cm²': 0.0001,
    'mm²': 0.000001,
    'mile²': 2589988.11,
    'yard²': 0.836127,
    'ft²': 0.092903,
    'in²': 0.00064516,
  },
  Volume: {
    L: 1,
    mL: 0.001,
    gal: 3.78541,
    qt: 0.946353,
    pt: 0.473176,
    cup: 0.236588,
    'fl oz': 0.0295735,
  },
  Mass: {
    kg: 1,
    g: 0.001,
    mg: 0.000001,
    lb: 0.453592,
    oz: 0.0283495,
    ton: 1000,
  },
  Data: {
    TB: 1099511627776,
    GB: 1073741824,
    MB: 1048576,
    KB: 1024,
    B: 1,
  },
  Speed: {
    'km/h': 0.277778,
    'm/s': 1,
    mph: 0.44704,
    'ft/s': 0.3048,
  },
  Time: {
    s: 1,
    min: 60,
    h: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  },
  Tip: {
    '%': 1,
  },
  Temperature: {
    Celsius: 1,
    Fahrenheit: 1,
    Kelvin: 1,
  },
};

const convertUnit = (value: number, from: string, to: string, category: string): number => {
  if (from === to) return value;

  // Special handling for temperature
  if (category === 'Temperature') {
    let celsius: number;
    if (from === 'Celsius') {
      celsius = value;
    } else if (from === 'Fahrenheit') {
      celsius = (value - 32) * (5 / 9);
    } else if (from === 'Kelvin') {
      celsius = value - 273.15;
    } else {
      return value;
    }

    if (to === 'Celsius') {
      return celsius;
    } else if (to === 'Fahrenheit') {
      return celsius * (9 / 5) + 32;
    } else if (to === 'Kelvin') {
      return celsius + 273.15;
    }
    return celsius;
  }

  // For categories with conversion factors
  if (conversionFactors[category] && conversionFactors[category][from] && conversionFactors[category][to]) {
    const fromFactor = conversionFactors[category][from];
    const toFactor = conversionFactors[category][to];
    const baseValue = value * fromFactor;
    return baseValue / toFactor;
  }

  return value;
};

export function SimpleCalculator() {
  const {
    expression,
    result,
    error,
    memory,
    appendToExpression,
    clear,
    backspace,
    evaluate,
    toggleSign,
    setResult,
    setError,
  } = useCalculator();

  const { showScientific, setShowScientific, setShowHistoryPanel, angleMode, showHistoryPanel } = useCalculatorStore();
  const [showUnitConverter, setShowUnitConverter] = useState(false);
  const [unitCategory, setUnitCategory] = useState('Length');
  const [unitFrom, setUnitFrom] = useState('m');
  const [unitTo, setUnitTo] = useState('km');
  const [tipPercentage, setTipPercentage] = useState('15');
  const [tipPeople, setTipPeople] = useState('1');

  const handleToggleScientific = () => {
    if (showUnitConverter) {
      setShowUnitConverter(false);
    }
    setShowScientific(!showScientific);
  };

  const handleToggleUnitConverter = () => {
    if (showScientific) {
      setShowScientific(false);
    }
    clear();
    setShowUnitConverter(!showUnitConverter);
  };

  const handleEvaluate = () => {
    if (showUnitConverter) {
      if (unitCategory === 'Tip') {
        // Tip calculator mode
        if (!expression) return;
        const billAmount = parseFloat(expression);
        if (isNaN(billAmount)) return;

        const tipPercent = parseFloat(tipPercentage) || 0;
        const people = parseInt(tipPeople) || 1;

        const tipAmount = billAmount * (tipPercent / 100);
        const totalAmount = billAmount + tipAmount;
        const eachPerson = totalAmount / people;

        setResult(`Tip: ${tipAmount.toFixed(2)} | Total: ${totalAmount.toFixed(2)} | Each: ${eachPerson.toFixed(2)}`);
        setError(null);
      } else {
        // Unit converter mode: perform conversion
        if (!expression) return;
        const numValue = parseFloat(expression);
        if (isNaN(numValue)) return;
        const convertedValue = convertUnit(numValue, unitFrom, unitTo, unitCategory);
        setResult(`${numValue} ${unitFrom} → ${convertedValue.toLocaleString()} ${unitTo}`);
        setError(null);
      }
    } else {
      // Normal calculator mode
      evaluate();
    }
  };

  const handleUnitCategoryChange = (newCategory: string) => {
    setUnitCategory(newCategory);
    if (newCategory === 'Tip') {
      setTipPercentage('15');
      setTipPeople('1');
    } else {
      setUnitFrom(units[newCategory][0]);
      setUnitTo(units[newCategory][0]);
    }
  };

  return (
    <div className="max-w-md mx-auto px-2 sm:px-0">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6">
        {/* Display */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 rounded-lg min-h-[100px] sm:min-h-[120px] flex flex-col">
          {(showScientific || showUnitConverter) && (
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {showUnitConverter
                ? unitCategory === 'Tip'
                  ? `Tip: ${tipPercentage}% | Split: ${tipPeople}`
                  : `${unitCategory}: ${unitFrom} → ${unitTo}`
                : angleMode.toUpperCase()}
            </div>
          )}
          <div className="flex-1 flex flex-col justify-end items-end">
            {expression && (
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1 sm:mb-2" aria-live="polite">
                {expression}
              </div>
            )}
            {error && (
              <div className="text-sm sm:text-lg text-red-500 dark:text-red-400 font-medium" role="alert">
                {error}
              </div>
            )}
            {result && !error && (
              <div className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white" aria-live="polite">
                {result}
              </div>
            )}
            {!result && !error && !expression && (
              <div className="text-lg sm:text-2xl text-gray-400 dark:text-gray-500">0</div>
            )}
          </div>
        </div>

        {/* Memory indicator */}
        {memory !== 0 && (
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            M: {memory}
          </div>
        )}

        {/* Function Toolbar */}
        <div className="mb-3 sm:mb-4 flex justify-between gap-1 sm:gap-2">
          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className={`flex-1 p-2 sm:p-3 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              showHistoryPanel
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            aria-label="History"
          >
            📜
          </button>
          <button
            onClick={handleToggleUnitConverter}
            className={`flex-1 p-2 sm:p-3 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              showUnitConverter
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            aria-label="Unit Converter"
          >
            📏
          </button>
          <button
            onClick={handleToggleScientific}
            className={`flex-1 p-2 sm:p-3 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              showScientific
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            aria-label="Toggle Scientific"
          >
            √x
          </button>
          <button
            onClick={backspace}
            className="flex-1 p-2 sm:p-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors text-xs sm:text-sm"
            aria-label="Backspace"
          >
            ✕
          </button>
        </div>

        {/* Unit Converter */}
        {showUnitConverter && (
          <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="mb-2 sm:mb-3">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Category
              </label>
              <select
                value={unitCategory}
                onChange={(e) => handleUnitCategoryChange(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {unitCategory === 'Tip' ? (
              // Tip calculator UI
              <div className="space-y-2 sm:space-y-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    Tip Percentage
                  </label>
                  <input
                    type="number"
                    value={tipPercentage}
                    onChange={(e) => setTipPercentage(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    Split per Head
                  </label>
                  <input
                    type="number"
                    value={tipPeople}
                    onChange={(e) => setTipPeople(e.target.value)}
                    min="1"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm"
                  />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Enter bill amount using number pad, then press =
                </div>
              </div>
            ) : (
              // Regular unit converter UI
              <div className="grid grid-cols-2 gap-1 sm:gap-2">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    From
                  </label>
                  <select
                    value={unitFrom}
                    onChange={(e) => setUnitFrom(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm"
                  >
                    {units[unitCategory].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    To
                  </label>
                  <select
                    value={unitTo}
                    onChange={(e) => setUnitTo(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm"
                  >
                    {units[unitCategory].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expandable Scientific Section */}
        <ScientificSection appendToExpression={appendToExpression} />

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2">
          {/* Row 1: Clear and backspace */}
          <button
            onClick={clear}
            className="p-3 sm:p-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors text-sm sm:text-base"
            aria-label="Clear All"
          >
            C
          </button>
          <button
            onClick={() => appendToExpression('(')}
            className="p-3 sm:p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm sm:text-base"
            aria-label="Left parenthesis"
          >
            (
          </button>
          <button
            onClick={() => appendToExpression(')')}
            className="p-3 sm:p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm sm:text-base"
            aria-label="Right parenthesis"
          >
            )
          </button>
          <button
            onClick={() => appendToExpression('/')}
            className="p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm sm:text-base"
            aria-label="Divide"
          >
            ÷
          </button>

          {/* Row 3: 7, 8, 9, multiply */}
          <button
            onClick={() => appendToExpression('7')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="7"
          >
            7
          </button>
          <button
            onClick={() => appendToExpression('8')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="8"
          >
            8
          </button>
          <button
            onClick={() => appendToExpression('9')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="9"
          >
            9
          </button>
          <button
            onClick={() => appendToExpression('*')}
            className="p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm sm:text-base"
            aria-label="Multiply"
          >
            ×
          </button>

          {/* Row 4: 4, 5, 6, subtract */}
          <button
            onClick={() => appendToExpression('4')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="4"
          >
            4
          </button>
          <button
            onClick={() => appendToExpression('5')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="5"
          >
            5
          </button>
          <button
            onClick={() => appendToExpression('6')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="6"
          >
            6
          </button>
          <button
            onClick={() => appendToExpression('-')}
            className="p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm sm:text-base"
            aria-label="Subtract"
          >
            −
          </button>

          {/* Row 5: 1, 2, 3, add */}
          <button
            onClick={() => appendToExpression('1')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="1"
          >
            1
          </button>
          <button
            onClick={() => appendToExpression('2')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="2"
          >
            2
          </button>
          <button
            onClick={() => appendToExpression('3')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="3"
          >
            3
          </button>
          <button
            onClick={() => appendToExpression('+')}
            className="p-3 sm:p-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm sm:text-base"
            aria-label="Add"
          >
            +
          </button>

          {/* Row 6: 0, decimal, sign, percent */}
          <button
            onClick={() => appendToExpression('0')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="0"
          >
            0
          </button>
          <button
            onClick={() => appendToExpression('.')}
            className="p-3 sm:p-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
            aria-label="Decimal point"
          >
            .
          </button>
          <button
            onClick={toggleSign}
            className="p-3 sm:p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm sm:text-base"
            aria-label="Toggle sign"
          >
            ±
          </button>
          <button
            onClick={() => appendToExpression('%')}
            className="p-3 sm:p-4 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm sm:text-base"
            aria-label="Percent"
          >
            %
          </button>

          {/* Row 7: equals */}
          <button
            onClick={handleEvaluate}
            className="p-3 sm:p-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors col-span-4 text-sm sm:text-base"
            aria-label="Equals"
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
}
