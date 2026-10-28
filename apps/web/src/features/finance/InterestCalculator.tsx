import { useState } from 'react';
import {
  calculateSimpleInterest,
  calculateCompoundInterest,
  formatNumberWithGrouping,
} from '@calculator-suite/math-core';

export function InterestCalculator() {
  const [calculatorType, setCalculatorType] = useState<'simple' | 'compound'>('simple');
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [timeYears, setTimeYears] = useState('');
  const [compoundingFrequency, setCompoundingFrequency] = useState<'annually' | 'semiannually' | 'quarterly' | 'monthly' | 'daily'>('annually');
  const [result, setResult] = useState<ReturnType<typeof calculateSimpleInterest> | ReturnType<typeof calculateCompoundInterest> | null>(null);
  const [numberFormat, setNumberFormat] = useState<'standard' | 'indian'>('standard');

  const handleCalculate = () => {
    const p = parseFloat(principal);
    const r = parseFloat(annualRate);
    const t = parseFloat(timeYears);

    if (isNaN(p) || isNaN(r) || isNaN(t) || p <= 0 || r < 0 || t <= 0) {
      alert('Please enter valid positive values');
      return;
    }

    let calcResult;
    if (calculatorType === 'simple') {
      calcResult = calculateSimpleInterest({ principal: p, annualRate: r, timeYears: t });
    } else {
      calcResult = calculateCompoundInterest({
        principal: p,
        annualRate: r,
        timeYears: t,
        compoundingFrequency,
      });
    }

    setResult(calcResult);
  };

  const formatCurrency = (value: number) => {
    return formatNumberWithGrouping(value, numberFormat, 2);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Interest Calculator</h3>

        <div className="mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setCalculatorType('simple')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'simple'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              Simple Interest
            </button>
            <button
              onClick={() => setCalculatorType('compound')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'compound'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              Compound Interest
            </button>
          </div>
        </div>

        <div className="space-y-4">
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
              Annual Interest Rate (%)
            </label>
            <input
              type="number"
              value={annualRate}
              onChange={(e) => setAnnualRate(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter annual interest rate"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Time (Years)
            </label>
            <input
              type="number"
              value={timeYears}
              onChange={(e) => setTimeYears(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter time in years"
            />
          </div>

          {calculatorType === 'compound' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Compounding Frequency
              </label>
              <select
                value={compoundingFrequency}
                onChange={(e) => setCompoundingFrequency(e.target.value as 'annually' | 'semiannually' | 'quarterly' | 'monthly' | 'daily')}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="annually">Annually</option>
                <option value="semiannually">Semi-annually</option>
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
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
            Calculate {calculatorType === 'simple' ? 'Simple' : 'Compound'} Interest
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="space-y-2 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <span>Interest:</span>
                <span className="font-medium">{formatCurrency(result.interest)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Amount:</span>
                <span className="font-medium">{formatCurrency(result.totalAmount)}</span>
              </div>
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
