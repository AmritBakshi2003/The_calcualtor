import { create, all } from 'mathjs';
// Create restricted math.js instance
const math = create(all);
math.import({
    ln: math.log,
    log10: math.log10,
}, { override: true });
/**
 * Parse a mathematical expression string into an AST
 * @param expression - The expression string to parse
 * @returns ParseResult with success status and error message if failed
 */
export function parseExpression(expression) {
    if (!expression || expression.trim().length === 0) {
        return { success: false, error: 'Empty expression' };
    }
    // Check for obviously malicious patterns
    const dangerousPatterns = [
        /function\s*\(/i,
        /=>/,
        /eval\(/i,
        /require\(/i,
        /import\s+/i,
        /process\./i,
        /__proto__/i,
        /constructor\[/i,
    ];
    for (const pattern of dangerousPatterns) {
        if (pattern.test(expression)) {
            return { success: false, error: 'Invalid expression: contains prohibited pattern' };
        }
    }
    // Check for assignment operations
    if (/[a-zA-Z_$][a-zA-Z0-9_$]*\s*=/.test(expression)) {
        return { success: false, error: 'Assignment operations are not allowed' };
    }
    // Check for property access patterns
    if (/\.[a-zA-Z_$][a-zA-Z0-9_$]*/.test(expression)) {
        return { success: false, error: 'Property access is not allowed' };
    }
    try {
        const node = math.parse(expression);
        return { success: true, node };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to parse expression',
        };
    }
}
