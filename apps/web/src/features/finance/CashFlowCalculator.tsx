import { useState } from 'react';
import { calculateROI, calculateNPV, calculateIRR } from '@calculator-suite/math-core';

export function CashFlowCalculator() {
  const [calculatorType, setCalculatorType] = useState<'roi' | 'npv' | 'irr'>('roi');
  const [initialInvestment, setInitialInvestment] = useState('');
  const [finalValue, setFinalValue] = useState('');
  const [discountRate, setDiscountRate] = useState('');
  const [cashFlows, setCashFlows] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calculateROI> | ReturnType<typeof calculateNPV> | ReturnType<typeof calculateIRR> | null>(null);

  const handleCalculate = () => {
    if (calculatorType === 'roi') {
      const initial = parseFloat(initialInvestment);
      const final = parseFloat(finalValue);

      if (isNaN(initial) || isNaN(final) || initial <= 0) {
        alert('Please enter valid positive values');
        return;
      }

      const roi = calculateROI({ initialInvestment: initial, finalValue: final });
      setResult({ roi });
    } else if (calculatorType === 'npv') {
      const rate = parseFloat(discountRate);
      const flows = cashFlows.split(',').map((s) => parseFloat(s.trim()));

      if (isNaN(rate) || flows.some(isNaN)) {
        alert('Please enter valid values');
        return;
      }

      const npv = calculateNPV({ discountRate: rate, cashFlows: flows });
      setResult({ npv });
    } else if (calculatorType === 'irr') {
      const flows = cashFlows.split(',').map((s) => parseFloat(s.trim()));

      if (flows.length < 2 || flows.some(isNaN)) {
        alert('Please enter at least 2 cash flow values');
        return;
      }

      try {
        const irr = calculateIRR(flows);
        setResult({ irr });
      } catch (error) {
        alert(error instanceof Error ? error.message : 'IRR calculation failed');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Cash Flow Calculator</h3>

        <div className="mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCalculatorType('roi')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'roi'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              ROI
            </button>
            <button
              onClick={() => setCalculatorType('npv')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'npv'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              NPV
            </button>
            <button
              onClick={() => setCalculatorType('irr')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'irr'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              IRR
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {calculatorType === 'roi' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Initial Investment
                </label>
                <input
                  type="number"
                  value={initialInvestment}
                  onChange={(e) => setInitialInvestment(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter initial investment"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Final Value
                </label>
                <input
                  type="number"
                  value={finalValue}
                  onChange={(e) => setFinalValue(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter final value"
                />
              </div>
            </>
          )}

          {(calculatorType === 'npv' || calculatorType === 'irr') && (
            <>
              {calculatorType === 'npv' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Discount Rate (%)
                  </label>
                  <input
                    type="number"
                    value={discountRate}
                    onChange={(e) => setDiscountRate(e.target.value)}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter discount rate"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cash Flows (comma-separated, first value is initial investment)
                </label>
                <input
                  type="text"
                  value={cashFlows}
                  onChange={(e) => setCashFlows(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., -10000, 3000, 3000, 3000, 3000"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Use negative for initial investment, positive for inflows
                </p>
              </div>
            </>
          )}

          <button
            onClick={handleCalculate}
            className="w-full p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Calculate {calculatorType.toUpperCase()}
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="text-gray-700 dark:text-gray-300">
              {calculatorType === 'roi' && (
                <div className="flex justify-between">
                  <span>ROI:</span>
                  <span className="font-medium">{result.roi.toFixed(2)}%</span>
                </div>
              )}
              {calculatorType === 'npv' && (
                <div className="flex justify-between">
                  <span>NPV:</span>
                  <span className="font-medium">{result.npv.toFixed(2)}</span>
                </div>
              )}
              {calculatorType === 'irr' && (
                <div className="flex justify-between">
                  <span>IRR:</span>
                  <span className="font-medium">{result.irr.toFixed(2)}%</span>
                </div>
              )}
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
