export interface EvaluateResult {
    success: boolean;
    result?: number | string;
    error?: string;
}
export interface EvaluateOptions {
    angleMode?: 'deg' | 'rad';
    lastAnswer?: number;
    maxIterations?: number;
    maxNesting?: number;
}
/**
 * Safely evaluate a mathematical expression
 * @param expression - The expression string to evaluate
 * @param options - Evaluation options
 * @returns EvaluateResult with success status, result, or error
 */
export declare function evaluateExpression(expression: string, options?: EvaluateOptions): EvaluateResult;
/**
 * Evaluate expression with simplified scope (for tests)
 */
export declare function evaluateSimple(expression: string): EvaluateResult;
//# sourceMappingURL=evaluator.d.ts.map