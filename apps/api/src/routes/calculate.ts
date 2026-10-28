import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { evaluateExpression, MAX_EXPRESSION_LENGTH } from '@calculator-suite/math-core';
import { AppError } from '../middleware/errorHandler.js';

const router: Router = Router();

// Validation schema for calculate request
const calculateSchema = z.object({
  expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
  angleMode: z.enum(['deg', 'rad']).optional(),
  lastAnswer: z.number().optional(),
});

type CalculateRequest = z.infer<typeof calculateSchema>;

/**
 * POST /api/calculate
 * Optional server-side calculation endpoint
 * Reuses the existing safe parser and evaluator from math-core
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const body: CalculateRequest = calculateSchema.parse(req.body);

    // Evaluate expression using math-core
    const result = evaluateExpression(body.expression, {
      angleMode: body.angleMode || 'deg',
      lastAnswer: body.lastAnswer,
    });

    if (!result.success) {
      throw new AppError(400, 'INVALID_EXPRESSION', result.error || 'Invalid expression');
    }

    res.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request body');
    }
    throw error;
  }
});

export { router as calculateRouter };
