import { Layout } from './components/Layout';
import { SimpleCalculator } from './features/simple/SimpleCalculator';
import { ScientificCalculator } from './features/scientific/ScientificCalculator';
import { FinanceCalculator } from './features/finance/FinanceCalculator';
import { ScanCalculator } from './features/scan/ScanCalculator';
import { useCalculatorStore } from './store';

function App() {
  const { mode } = useCalculatorStore();

  const renderCalculator = () => {
    switch (mode) {
      case 'simple':
        return <SimpleCalculator />;
      case 'scientific':
        return <ScientificCalculator />;
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
    </Layout>
  );
}

export default App;
