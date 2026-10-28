/**
 * The scan alphabet and normalize() now live in @calculator-suite/math-core
 * (`packages/math-core/src/ocr/normalize.ts`) so the browser scanner and the
 * Worker's OCR.space engine share one implementation. Re-exported here so
 * existing `./normalize` imports in the scanner keep working.
 */
export {
  normalize,
  normalizeWithWarnings,
  SCAN_WHITELIST,
  type NormalizeResult,
} from '@calculator-suite/math-core';
