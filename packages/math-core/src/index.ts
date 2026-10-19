// Expression parsing and evaluation
export { parseExpression } from './expression/parser';
export { evaluateExpression, evaluateSimple, EvaluateResult, EvaluateOptions } from './expression/evaluator';
export {
  validateNumberBounds,
  validatePercentage,
  validateRate,
  validatePrincipal,
  validateTenure,
  validateFactorialInput,
  validateSqrtInput,
  validateLogInput,
  validateExpressionLength,
  ValidationResult,
} from './expression/validator';

// Scientific functions
export {
  sin,
  cos,
  tan,
  asin,
  acos,
  atan,
  sinh,
  cosh,
  tanh,
  degToRad,
  radToDeg,
  AngleMode,
} from './scientific/trig';
export {
  PI,
  E,
  GOLDEN_RATIO,
  SQRT_2,
  SQRT_3,
  LN_2,
  LN_10,
  LOG_10_E,
  LOG_2_E,
} from './scientific/constants';

// Finance functions
export {
  calculateEMI,
  generateAmortizationSchedule,
  EMIInput,
  EMIResult,
  AmortizationScheduleItem,
} from './finance/emi';
export {
  calculateSimpleInterest,
  calculateCompoundInterest,
  SimpleInterestInput,
  SimpleInterestResult,
  CompoundInterestInput,
  CompoundInterestResult,
} from './finance/interest';
export { calculateSIP, SIPInput, SIPResult } from './finance/sip';
export { calculateLumpSum, calculateCAGR, LumpSumInput, LumpSumResult, CAGRInput } from './finance/growth';
export { calculateROI, calculateNPV, calculateIRR, ROIInput, NPVInput, IRROptions } from './finance/roi';
export {
  calculateTax,
  calculateDiscount,
  TaxInput,
  TaxResult,
  TaxMode,
  DiscountInput,
  DiscountResult,
} from './finance/tax';

// Formatting functions
export {
  formatNumber,
  formatNumberWithGrouping,
  formatPercentage,
  formatCurrency,
  formatScientific,
  shouldUseScientificNotation,
  formatNumberAuto,
  NumberFormat,
  RoundingMode,
} from './formatting/number';
export { detectUserLocale, LocaleOptions } from './formatting/locale';
