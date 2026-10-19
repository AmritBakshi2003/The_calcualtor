import { evaluate } from 'mathjs';
import { parseExpression } from './parser';
const DEFAULT_OPTIONS = {
    angleMode: 'deg',
    maxIterations: 1000,
    maxNesting: 100,
};
/**
 * Safely evaluate a mathematical expression
 * @param expression - The expression string to evaluate
 * @param options - Evaluation options
 * @returns EvaluateResult with success status, result, or error
 */
export function evaluateExpression(expression, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    // Parse the expression
    const parseResult = parseExpression(expression);
    if (!parseResult.success) {
        return { success: false, error: parseResult.error };
    }
    const node = parseResult.node;
    // Create a restricted scope
    const scope = {
        pi: Math.PI,
        e: Math.E,
        i: Math.sqrt(-1),
    };
    // Add last answer if provided
    if (opts.lastAnswer !== undefined) {
        scope.ans = opts.lastAnswer;
    }
    // Configure trig functions based on angle mode
    const toRad = opts.angleMode === 'deg' ? (deg) => deg * (Math.PI / 180) : (rad) => rad;
    const toDeg = opts.angleMode === 'deg' ? (rad) => rad : (rad) => rad * (180 / Math.PI);
    // Override trig functions with angle mode handling
    scope.sin = (x) => Math.sin(toRad(x));
    scope.cos = (x) => Math.cos(toRad(x));
    scope.tan = (x) => Math.tan(toRad(x));
    scope.asin = (x) => toDeg(Math.asin(x));
    scope.acos = (x) => toDeg(Math.acos(x));
    scope.atan = (x) => toDeg(Math.atan(x));
    try {
        // Evaluate using the string with the restricted scope
        const result = evaluate(expression, scope);
        // Check for non-finite values
        if (typeof result === 'number') {
            if (!isFinite(result)) {
                if (isNaN(result)) {
                    return { success: false, error: 'Result is not a number' };
                }
                if (result === Infinity || result === -Infinity) {
                    return { success: false, error: 'Result is too large (overflow)' };
                }
            }
        }
        return { success: true, result };
    }
    catch (error) {
        let errorMessage = 'Evaluation error';
        if (error instanceof Error) {
            if (error.message.includes('Division by zero')) {
                errorMessage = 'Cannot divide by zero';
            }
            else if (error.message.includes('Infinity')) {
                errorMessage = 'Result is too large (overflow)';
            }
            else if (error.message.includes('complex')) {
                errorMessage = 'Complex numbers are not supported';
            }
            else {
                errorMessage = error.message;
            }
        }
        return { success: false, error: errorMessage };
    }
}
/**
 * Evaluate expression with simplified scope (for tests)
 */
export function evaluateSimple(expression) {
    return evaluateExpression(expression);
}
