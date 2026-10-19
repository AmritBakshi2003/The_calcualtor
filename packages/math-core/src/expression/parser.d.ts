import { MathNode } from 'mathjs';
export interface ParseResult {
    success: boolean;
    error?: string;
    node?: MathNode;
}
/**
 * Parse a mathematical expression string into an AST
 * @param expression - The expression string to parse
 * @returns ParseResult with success status and error message if failed
 */
export declare function parseExpression(expression: string): ParseResult;
//# sourceMappingURL=parser.d.ts.map