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

export function UnitConverter() {
  const [category, setCategory] = useState('Length');
  const [value, setValue] = useState('');
  const [fromUnit, setFromUnit] = useState('m');
  const [toUnit, setToUnit] = useState('km');
  const [result, setResult] = useState<number | null>(null);

  const handleConvert = () => {
    if (!value) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    // Simple conversion (placeholder - actual formulas would be implemented)
    // For now, just display the value as-is
    setResult(numValue);
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setFromUnit(units[newCategory][0]);
    setToUnit(units[newCategory][0]);
    setValue('');
    setResult(null);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Unit Converter
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Value
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter value"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              From
            </label>
            <select
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {units[category].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              To
            </label>
            <select
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {units[category].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleConvert}
          className="w-full p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors mb-4"
        >
          Convert
        </button>

        {result !== null && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Result</h4>
            <div className="text-2xl font-mono text-green-700 dark:text-green-400">
              {result} {toUnit}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
