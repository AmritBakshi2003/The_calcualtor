import { useState } from 'react';
import { calculateEMI, generateAmortizationSchedule, formatNumberWithGrouping } from '@calculator-suite/math-core';

export function EMICalculator() {
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [numberFormat, setNumberFormat] = useState<'standard' | 'indian'>('standard');

  const handleCalculate = () => {
    const p = parseFloat(principal);
    const r = parseFloat(annualRate);
    const n = parseInt(tenureMonths);

    if (isNaN(p) || isNaN(r) || isNaN(n) || p <= 0 || r < 0 || n <= 0) {
      alert('Please enter valid positive values');
      return;
    }

    const emiResult = calculateEMI({ principal: p, annualRate: r, tenureMonths: n });
    const schedule = generateAmortizationSchedule({ principal: p, annualRate: r, tenureMonths: n });

    setResult({ ...emiResult, schedule });
    setShowSchedule(false);
  };

  const formatCurrency = (value: number) => {
    return formatNumberWithGrouping(value, numberFormat, 2);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">EMI Calculator</h3>

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
              Tenure (Months)
            </label>
            <input
              type="number"
              value={tenureMonths}
              onChange={(e) => setTenureMonths(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter tenure in months"
            />
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
            Calculate EMI
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="space-y-2 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <span>EMI:</span>
                <span className="font-medium">{formatCurrency(result.emi)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Payment:</span>
                <span className="font-medium">{formatCurrency(result.totalPayment)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Interest:</span>
                <span className="font-medium">{formatCurrency(result.totalInterest)}</span>
              </div>
            </div>

            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="mt-4 p-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            >
              {showSchedule ? 'Hide' : 'Show'} Amortization Schedule
            </button>

            {showSchedule && (
              <div className="mt-4 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200 dark:bg-gray-600">
                    <tr>
                      <th className="p-2 text-left">Month</th>
                      <th className="p-2 text-right">Principal</th>
                      <th className="p-2 text-right">Interest</th>
                      <th className="p-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((item: any) => (
                      <tr key={item.month} className="border-b border-gray-200 dark:border-gray-600">
                        <td className="p-2">{item.month}</td>
                        <td className="p-2 text-right">{formatCurrency(item.principalPayment)}</td>
                        <td className="p-2 text-right">{formatCurrency(item.interestPayment)}</td>
                        <td className="p-2 text-right">{formatCurrency(item.remainingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
