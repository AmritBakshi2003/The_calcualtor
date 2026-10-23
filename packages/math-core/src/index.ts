// OCR output normalization (shared by the browser scanner and the Worker)
export { normalize, SCAN_WHITELIST } from './ocr/normalize';

// Expression parsing and evaluation
export {
  parseExpression,
  MAX_EXPRESSION_LENGTH,
  MAX_NESTING_DEPTH,
  getAllowedFunctions,
  getAllowedConstants,
} from './expression/parser';
export type { ParseResult, ParseOptions } from './expression/parser';
export { evaluateExpression } from './expression/evaluator';
export type { EvaluateResult, EvaluateOptions } from './expression/evaluator';
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
} from './expression/validator';
export type { ValidationResult } from './expression/validator';

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
} from './scientific/trig';
export type { AngleMode } from './scientific/trig';
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
export { calculateEMI, generateAmortizationSchedule } from './finance/emi';
export type { EMIInput, EMIResult, AmortizationScheduleItem } from './finance/emi';
export { calculateSimpleInterest, calculateCompoundInterest } from './finance/interest';
export type {
  SimpleInterestInput,
  SimpleInterestResult,
  CompoundInterestInput,
  CompoundInterestResult,
} from './finance/interest';
export { calculateSIP } from './finance/sip';
export type { SIPInput, SIPResult } from './finance/sip';
export { calculateLumpSum, calculateCAGR } from './finance/growth';
export type { LumpSumInput, LumpSumResult, CAGRInput, CAGRResult } from './finance/growth';
export { calculateROI, calculateNPV, calculateIRR } from './finance/roi';
export type {
  ROIInput,
  NPVInput,
  IRROptions,
  ROIResult,
  NPVResult,
  IRRResult,
} from './finance/roi';
export { calculateTax, calculateDiscount } from './finance/tax';
export type { TaxInput, TaxResult, TaxMode, DiscountInput, DiscountResult } from './finance/tax';

// Formatting functions
export {
  formatNumber,
  formatNumberWithGrouping,
  formatPercentage,
  formatCurrency,
  formatScientific,
  shouldUseScientificNotation,
  formatNumberAuto,
} from './formatting/number';
export type { NumberFormat, RoundingMode } from './formatting/number';
export { detectUserLocale } from './formatting/locale';
export type { LocaleOptions } from './formatting/locale';
