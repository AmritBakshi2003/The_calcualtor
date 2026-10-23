/**
 * Phase-1 normalized alphabet.
 *
 * This exact string is BOTH the Tesseract character whitelist (step 3
 * setting, see `useOCRWorker.ts`) and the alphabet `normalize()` (step 4)
 * cleans raw recognizer output down to, so the recognizer and the cleaner
 * can never drift apart.
 *
 * One alphabet, one source of truth. `normalize()` maps look-alikes onto it:
 * x/X/* -> "×", look-alikes of ÷ -> "÷"; anything outside the string is
 * dropped before validation.
 */
export const SCAN_WHITELIST = '0123456789+-×÷*/().=x';
