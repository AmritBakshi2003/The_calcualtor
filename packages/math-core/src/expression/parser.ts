import { parse, type MathNode } from 'mathjs';
import { validateExpressionLength } from './validator';

export interface ParseResult {
  success: boolean;
  error?: string;
  node?: MathNode;
}

export interface ParseOptions {
  /** Maximum number of characters accepted (default {@link MAX_EXPRESSION_LENGTH}). */
  maxLength?: number;
  /** Maximum parenthesis / function nesting depth (default {@link MAX_NESTING_DEPTH}). */
  maxNesting?: number;
}

/** Hard limit on expression length, enforced before anything is parsed. */
export const MAX_EXPRESSION_LENGTH = 500;

/** Maximum allowed nesting (parentheses or nested function calls). */
export const MAX_NESTING_DEPTH = 100;

/** Node types the evaluator knows how to handle. Everything else is rejected. */
const ALLOWED_NODE_TYPES = new Set([
  'ConstantNode',
  'SymbolNode',
  'OperatorNode',
  'ParenthesisNode',
  'FunctionNode',
]);

/** Operators produced by mathjs for supported arithmetic. */
const ALLOWED_OPERATORS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'pow',
  'mod',
  'unaryMinus',
  'unaryPlus',
  'factorial',
]);

/** Functions that may be called, and that the evaluator provides explicitly. */
const ALLOWED_FUNCTIONS = new Set([
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'cbrt',
  'ceil',
  'cos',
  'cosh',
  'exp',
  'factorial',
  'floor',
  'ln',
  'log',
  'log10',
  'log2',
  'max',
  'min',
  'nCr',
  'round',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
]);

/** Constants that may appear as bare symbols. `ans` is supplied at evaluation time. */
const ALLOWED_CONSTANTS = new Set(['pi', 'e', 'ans']);

export function getAllowedFunctions(): readonly string[] {
  return [...ALLOWED_FUNCTIONS];
}

export function getAllowedConstants(): readonly string[] {
  return [...ALLOWED_CONSTANTS];
}

/**
 * Measure the maximum parenthesis depth without parsing.
 * Rejects deeply nested bombs before the parser allocates anything.
 */
function parenthesesDepthExceeded(expression: string, maxNesting: number): boolean {
  let depth = 0;
  for (const char of expression) {
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      if (depth > maxNesting) return true;
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
    }
  }
  return false;
}

/** Recursively measure AST depth (nested calls such as `sin(sin(1))`). */
function astDepth(node: MathNode): number {
  let maxChildDepth = 0;
  node.forEach((child) => {
    maxChildDepth = Math.max(maxChildDepth, astDepth(child));
  });
  return 1 + maxChildDepth;
}

/**
 * Walk the AST and reject anything outside the allow-list.
 * This is the primary control — the evaluator never sees a rejected tree.
 */
function validateNode(node: MathNode): string | null {
  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    if (node.type === 'AccessorNode' || node.type === 'IndexNode') {
      return 'Property access is not allowed';
    }
    if (node.type === 'AssignmentNode' || node.type === 'FunctionAssignmentNode') {
      return 'Assignment operations are not allowed';
    }
    return `Unsupported expression construct: ${node.type}`;
  }

  switch (node.type) {
    case 'ConstantNode': {
      const value = (node as unknown as { value: unknown }).value;
      if (typeof value !== 'number') {
        return 'Only numeric literals are allowed';
      }
      return null;
    }

    case 'SymbolNode': {
      const name = (node as unknown as { name: string }).name;
      if (!ALLOWED_CONSTANTS.has(name) && !ALLOWED_FUNCTIONS.has(name)) {
        return `Unknown name: ${name}`;
      }
      return null;
    }

    case 'OperatorNode': {
      const fn = (node as unknown as { fn: string }).fn;
      if (!ALLOWED_OPERATORS.has(fn)) {
        return `Unsupported operator: ${(node as unknown as { op: string }).op}`;
      }
      return null;
    }

    case 'FunctionNode': {
      const fnNode = (node as unknown as { fn: MathNode }).fn;
      if (fnNode.type !== 'SymbolNode') {
        return 'Indirect function calls are not allowed';
      }
      const name = (fnNode as unknown as { name: string }).name;
      if (!ALLOWED_FUNCTIONS.has(name)) {
        return `Function is not allowed: ${name}`;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Parse a mathematical expression string into an AST.
 *
 * The result is only usable for evaluation if it passes the allow-list above:
 * no property access, no assignment, no unknown functions or symbols.
 *
 * @param expression - The expression string to parse
 * @param options - Length and nesting limits
 * @returns ParseResult with success status and error message if failed
 */
export function parseExpression(expression: string, options: ParseOptions = {}): ParseResult {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    return { success: false, error: 'Empty expression' };
  }

  const maxLength = options.maxLength ?? MAX_EXPRESSION_LENGTH;
  const maxNesting = options.maxNesting ?? MAX_NESTING_DEPTH;

  const lengthCheck = validateExpressionLength(expression.trim(), maxLength);
  if (!lengthCheck.valid) {
    return { success: false, error: lengthCheck.error };
  }

  if (parenthesesDepthExceeded(expression, maxNesting)) {
    return {
      success: false,
      error: `Expression nesting exceeds the maximum depth of ${maxNesting}`,
    };
  }

  let node: MathNode;
  try {
    node = parse(expression);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse expression',
    };
  }

  const rejections: string[] = [];
  node.traverse((current) => {
    if (rejections.length > 0) return;
    const reason = validateNode(current);
    if (reason) rejections.push(reason);
  });

  if (rejections.length > 0) {
    return { success: false, error: rejections[0] };
  }

  if (astDepth(node) > maxNesting) {
    return {
      success: false,
      error: `Expression nesting exceeds the maximum depth of ${maxNesting}`,
    };
  }

  return { success: true, node };
}
