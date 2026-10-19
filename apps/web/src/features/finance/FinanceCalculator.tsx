import { useState } from 'react';
import { EMICalculator } from './EMICalculator';
import { InterestCalculator } from './InterestCalculator';
import { SIPCalculator } from './SIPCalculator';
import { InvestmentCalculator } from './InvestmentCalculator';
import { CashFlowCalculator } from './CashFlowCalculator';
import { TaxCalculator } from './TaxCalculator';

export function FinanceCalculator() {
  const [activeTab, setActiveTab] = useState<'emi' | 'interest' | 'sip' | 'investment' | 'cashflow' | 'tax'>('emi');

  const tabs = [
    { key: 'emi' as const, label: 'EMI' },
    { key: 'interest' as const, label: 'Interest' },
    { key: 'sip' as const, label: 'SIP' },
    { key: 'investment' as const, label: 'Investment' },
    { key: 'cashflow' as const, label: 'Cash Flow' },
    { key: 'tax' as const, label: 'Tax/GST' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Finance Calculator
        </h2>

        <div className="mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeTab === 'emi' && <EMICalculator />}
          {activeTab === 'interest' && <InterestCalculator />}
          {activeTab === 'sip' && <SIPCalculator />}
          {activeTab === 'investment' && <InvestmentCalculator />}
          {activeTab === 'cashflow' && <CashFlowCalculator />}
          {activeTab === 'tax' && <TaxCalculator />}
        </div>
      </div>
    </div>
  );
}
