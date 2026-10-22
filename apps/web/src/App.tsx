import { Layout } from './components/Layout';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { SimpleCalculator } from './features/simple/SimpleCalculator';
import { FinanceCalculator } from './features/finance/FinanceCalculator';
import { ScanCalculator } from './features/scan/ScanCalculator';
import { useCalculatorStore } from './store';

function App() {
  const { mode } = useCalculatorStore();

  const renderCalculator = () => {
    switch (mode) {
      case 'simple':
        return <SimpleCalculator />;
      case 'finance':
        return <FinanceCalculator />;
      case 'scan':
        return <ScanCalculator />;
      default:
        return <SimpleCalculator />;
    }
  };

  return (
    <Layout>
      {renderCalculator()}
      <PwaUpdateBanner />
    </Layout>
  );
}

export default App;
