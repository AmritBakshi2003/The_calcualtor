import { useState } from 'react';
import { calculateTax, calculateDiscount } from '@calculator-suite/math-core';

export function TaxCalculator() {
  const [calculatorType, setCalculatorType] = useState<'tax' | 'discount'>('tax');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [taxMode, setTaxMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [result, setResult] = useState<any>(null);

  const handleCalculate = () => {
    const amt = parseFloat(amount);
    const r = parseFloat(rate);

    if (isNaN(amt) || isNaN(r) || amt <= 0 || r < 0) {
      alert('Please enter valid positive values');
      return;
    }

    if (calculatorType === 'tax') {
      const taxResult = calculateTax({ amount: amt, rate: r, mode: taxMode });
      setResult(taxResult);
    } else {
      const discountResult = calculateDiscount({ originalPrice: amt, discountRate: r });
      setResult(discountResult);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Tax & Discount Calculator</h3>

        <div className="mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setCalculatorType('tax')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'tax'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              Tax/GST
            </button>
            <button
              onClick={() => setCalculatorType('discount')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                calculatorType === 'discount'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              Discount
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {calculatorType === 'tax' ? 'Amount' : 'Original Price'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder={calculatorType === 'tax' ? 'Enter amount' : 'Enter original price'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {calculatorType === 'tax' ? 'Tax Rate (%)' : 'Discount Rate (%)'}
            </label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder={calculatorType === 'tax' ? 'Enter tax rate' : 'Enter discount rate'}
            />
          </div>

          {calculatorType === 'tax' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tax Mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTaxMode('exclusive')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    taxMode === 'exclusive'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  Exclusive (Add Tax)
                </button>
                <button
                  onClick={() => setTaxMode('inclusive')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    taxMode === 'inclusive'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  Inclusive (Tax Included)
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleCalculate}
            className="w-full p-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Calculate {calculatorType === 'tax' ? 'Tax' : 'Discount'}
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Results</h4>
            <div className="space-y-2 text-gray-700 dark:text-gray-300">
              {calculatorType === 'tax' ? (
                <>
                  <div className="flex justify-between">
                    <span>Base Amount:</span>
                    <span className="font-medium">{result.baseAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax Amount:</span>
                    <span className="font-medium">{result.taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Amount:</span>
                    <span className="font-medium">{result.totalAmount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Discount Amount:</span>
                    <span className="font-medium">{result.discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Final Price:</span>
                    <span className="font-medium">{result.finalPrice.toFixed(2)}</span>
                  </div>
                </>
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
