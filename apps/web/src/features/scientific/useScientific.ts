import { useCalculator } from '../simple/useCalculator';

export function useScientific() {
  const calculator = useCalculator();

  return calculator;
}
