import { useState } from 'react';
import { calculateSIP, formatNumberWithGrouping } from '@calculator-suite/math-core';

export function SIPCalculator() {
  const [monthlyInvestment, setMonthlyInvestment] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [tenureYears, setTenureYears] = useState('');
  const [beginOfMonth, setBeginOfMonth] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof calculateSIP> | null>(null);
  const [numberFormat, setNumberFormat] = useState<'standard' | 'indian'>('standard');

  const handleCalculate = () => {
    const monthly = parseFloat(monthlyInvestment);
    const rate = parseFloat(annualRate);
    const years = parseFloat(tenureYears);

    if (isNaN(monthly) || isNaN(rate) || isNaN(years) || monthly <= 0 || rate < 0 || years <= 0) {
      alert('Please enter valid positive values');
      return;
    }

    const sipResult = calculateSIP({
      monthlyInvestment: monthly,
      annualRate: rate,
      tenureYears: years,
      beginOfMonth,
    });

    setResult(sipResult);
  };

  const formatCurrency = (value: number) => {
    return formatNumberWithGrouping(value, numberFormat, 2);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">SIP Calculator</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Monthly Investment
            </label>
            <input
              type="number"
              value={monthlyInvestment}
              onChange={(e) => setMonthlyInvestment(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter monthly investment amount"
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="beginOfMonth"
              checked={beginOfMonth}
              onChange={(e) => setBeginOfMonth(e.target.checked)}
              className="w-4 h-4 text-blue-500"
            />
            <label htmlFor="beginOfMonth" className="text-sm text-gray-700 dark:text-gray-300">
              Invest at beginning of period
            </label>
          </div>

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
            Calculate SIP Returns
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="space-y-2 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <span>Total Invested:</span>
                <span className="font-medium">{formatCurrency(result.totalInvested)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Value:</span>
                <span className="font-medium">{formatCurrency(result.totalValue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Returns:</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(result.totalReturns)}
                </span>
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
