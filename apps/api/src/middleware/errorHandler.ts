import { Request, Response, NextFunction } from 'express';

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  // Don't leak stack traces in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(isDevelopment && err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Unexpected errors
  res.status(500).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    ...(isDevelopment ? { details: err.message } : {}),
  });
}
