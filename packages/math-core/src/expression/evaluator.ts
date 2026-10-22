import { sin, cos, tan, asin, acos, atan } from '../scientific/trig';
import {
  validateFactorialInput,
  validateLogInput,
  validateSqrtInput,
  type ValidationResult,
} from './validator';
import { parseExpression, type ParseOptions } from './parser';

export interface EvaluateResult {
  success: boolean;
  result?: number | string;
  error?: string;
}

export interface EvaluateOptions extends ParseOptions {
  angleMode?: 'deg' | 'rad';
  lastAnswer?: number;
}

/** Thrown by scope functions for mathematically invalid input. */
class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

function assertValid(check: ValidationResult): void {
  if (!check.valid) {
    throw new DomainError(check.error ?? 'Invalid input');
  }
}

function integerFactorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Build the evaluation scope. Only these names are reachable from an
 * expression, and the returned object is frozen so evaluation cannot add to it.
 */
function createScope(mode: 'deg' | 'rad', lastAnswer?: number) {
  const scope: Record<string, number | ((...args: number[]) => number)> = {
    pi: Math.PI,
    e: Math.E,

    // Trigonometry honours the requested angle mode in both directions.
    sin: (x: number) => sin(x, mode),
    cos: (x: number) => cos(x, mode),
    tan: (x: number) => {
      if (Math.abs(cos(x, mode)) < 1e-12) {
        throw new DomainError('tan is undefined at this angle');
      }
      return tan(x, mode);
    },
    asin: (x: number) => {
      if (!(x >= -1 && x <= 1)) {
        throw new DomainError('asin is defined only for values between -1 and 1');
      }
      return asin(x, mode);
    },
    acos: (x: number) => {
      if (!(x >= -1 && x <= 1)) {
        throw new DomainError('acos is defined only for values between -1 and 1');
      }
      return acos(x, mode);
    },
    atan: (x: number) => atan(x, mode),

    sinh: (x: number) => Math.sinh(x),
    cosh: (x: number) => Math.cosh(x),
    tanh: (x: number) => Math.tanh(x),
    asinh: (x: number) => Math.asinh(x),
    acosh: (x: number) => {
      if (!(x >= 1)) {
        throw new DomainError('acosh is defined only for values greater than or equal to 1');
      }
      return Math.acosh(x);
    },
    atanh: (x: number) => {
      if (!(x > -1 && x < 1)) {
        throw new DomainError('atanh is defined only for values between -1 and 1');
      }
      return Math.atanh(x);
    },

    // Roots and logarithms reject domain errors instead of yielding NaN/complex.
    sqrt: (x: number) => {
      assertValid(validateSqrtInput(x));
      return Math.sqrt(x);
    },
    cbrt: (x: number) => Math.cbrt(x),
    ln: (x: number) => {
      assertValid(validateLogInput(x));
      return Math.log(x);
    },
    log: (x: number) => {
      assertValid(validateLogInput(x));
      return Math.log10(x);
    },
    log10: (x: number) => {
      assertValid(validateLogInput(x));
      return Math.log10(x);
    },
    log2: (x: number) => {
      assertValid(validateLogInput(x));
      return Math.log2(x);
    },
    exp: (x: number) => Math.exp(x),

    abs: (x: number) => Math.abs(x),
    round: (x: number) => Math.round(x),
    floor: (x: number) => Math.floor(x),
    ceil: (x: number) => Math.ceil(x),
    min: (...values: number[]) => Math.min(...values),
    max: (...values: number[]) => Math.max(...values),

    factorial: (x: number) => {
      assertValid(validateFactorialInput(x));
      return integerFactorial(x);
    },
    nCr: (n: number, r: number) => {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
        throw new DomainError('nCr requires integers with 0 <= r <= n');
      }
      assertValid(validateFactorialInput(n));
      return integerFactorial(n) / (integerFactorial(r) * integerFactorial(n - r));
    },
  };

  if (lastAnswer !== undefined) {
    scope.ans = lastAnswer;
  }

  return Object.freeze(scope);
}

/**
 * Safely evaluate a mathematical expression.
 *
 * The parsed AST is validated against an allow-list (see `parseExpression`)
 * and then evaluated against a frozen scope. The raw string is never handed to
 * a general-purpose evaluator, so nothing outside the scope is reachable.
 *
 * @param expression - The expression string to evaluate
 * @param options - Evaluation options
 * @returns EvaluateResult with success status, result, or error
 */
export function evaluateExpression(
  expression: string,
  options: EvaluateOptions = {}
): EvaluateResult {
  const angleMode = options.angleMode ?? 'deg';

  const parseResult = parseExpression(expression, {
    maxLength: options.maxLength,
    maxNesting: options.maxNesting,
  });
  if (!parseResult.success || !parseResult.node) {
    return { success: false, error: parseResult.error };
  }

  const scope = createScope(angleMode, options.lastAnswer);

  try {
    const result: unknown = parseResult.node.evaluate(scope);

    // Only plain real numbers are supported: complex numbers, units and
    // matrices are rejected rather than silently coerced.
    if (typeof result !== 'number') {
      return { success: false, error: 'Result is not a real number' };
    }

    if (Number.isNaN(result)) {
      return { success: false, error: 'Result is not a number' };
    }

    if (!isFinite(result)) {
      return { success: false, error: 'Result is too large (overflow)' };
    }

    return { success: true, result };
  } catch (error) {
    let errorMessage = 'Evaluation error';

    if (error instanceof Error) {
      if (error instanceof DomainError) {
        errorMessage = error.message;
      } else if (error.message.includes('Division by zero')) {
        errorMessage = 'Cannot divide by zero';
      } else if (error.message.includes('Infinity')) {
        errorMessage = 'Result is too large (overflow)';
      } else if (error.message.includes('complex')) {
        errorMessage = 'Complex numbers are not supported';
      } else {
        errorMessage = error.message;
      }
    }

    return { success: false, error: errorMessage };
  }
}
