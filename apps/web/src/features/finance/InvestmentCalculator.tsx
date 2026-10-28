import { useState } from 'react';
import { calculateLumpSum, calculateCAGR, formatNumberWithGrouping, type LumpSumResult, type CAGRResult } from '@calculator-suite/math-core';

export function InvestmentCalculator() {
  const [calculatorType, setCalculatorType] = useState<'lumpsum' | 'cagr'>('lumpsum');
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [tenureYears, setTenureYears] = useState('');
  const [startValue, setStartValue] = useState('');
  const [endValue, setEndValue] = useState('');
  const [result, setResult] = useState<LumpSumResult | CAGRResult | null>(null);
  const [numberFormat, setNumberFormat] = useState<'standard' | 'indian'>('standard');

  const handleCalculate = () => {
    if (calculatorType === 'lumpsum') {
      const p = parseFloat(principal);
      const r = parseFloat(annualRate);
      const t = parseFloat(tenureYears);

      if (isNaN(p) || isNaN(r) || isNaN(t) || p <= 0 || r < 0 || t <= 0) {
        alert('Please enter valid positive values');
        return;
      }

      setResult(calculateLumpSum({ principal: p, annualRate: r, tenureYears: t }));
    } else {
      const sv = parseFloat(startValue);
      const ev = parseFloat(endValue);
      const t = parseFloat(tenureYears);

      if (isNaN(sv) || isNaN(ev) || isNaN(t) || sv <= 0 || ev <= 0 || t <= 0) {
        alert('Please enter valid positive values');
        return;
      }

      try {
        setResult(calculateCAGR({ startValue: sv, endValue: ev, tenureYears: t }));
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Calculation error');
      }
    }
  };

  const formatCurrency = (value: number) => {
    return formatNumberWithGrouping(value, numberFormat, 2);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Investment Calculator</h3>

        <div className="mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setCalculatorType('lumpsum')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'lumpsum'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              Lump Sum Growth
            </button>
            <button
              onClick={() => setCalculatorType('cagr')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'cagr'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              CAGR
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {calculatorType === 'lumpsum' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Principal Amount
                </label>
                <input
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter principal amount"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Annual Return Rate (%)
                </label>
                <input
                  type="number"
                  value={annualRate}
                  onChange={(e) => setAnnualRate(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter expected annual return rate"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Investment Period (Years)
                </label>
                <input
                  type="number"
                  value={tenureYears}
                  onChange={(e) => setTenureYears(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter investment period in years"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Value
                </label>
                <input
                  type="number"
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter starting value"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Value
                </label>
                <input
                  type="number"
                  value={endValue}
                  onChange={(e) => setEndValue(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter ending value"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Period (Years)
                </label>
                <input
                  type="number"
                  value={tenureYears}
                  onChange={(e) => setTenureYears(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter period in years"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Number Format:
            </label>
            <select
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value as 'standard' | 'indian')}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="standard">Standard (1,000,000)</option>
              <option value="indian">Indian (10,00,000)</option>
            </select>
          </div>

          <button
            onClick={handleCalculate}
            className="w-full p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Calculate {calculatorType === 'lumpsum' ? 'Growth' : 'CAGR'}
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="space-y-2 text-gray-700 dark:text-gray-300">
              {calculatorType === 'lumpsum' && 'finalValue' in result ? (
                <>
                  <div className="flex justify-between">
                    <span>Final Value:</span>
                    <span className="font-medium">{formatCurrency(result.finalValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Returns:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(result.totalReturns)}
                    </span>
                  </div>
                </>
              ) : calculatorType === 'cagr' && 'cagr' in result ? (
                <div className="flex justify-between">
                  <span>CAGR:</span>
                  <span className="font-medium">{result.cagr.toFixed(2)}%</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          ⚠️ Disclaimer: These results are estimates and not financial advice. Please consult a financial advisor for personalized advice.
        </p>
      </div>
    </div>
  );
}
