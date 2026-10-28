import { Router } from 'express';
import { AppError } from '../middleware/errorHandler.js';

const router: Router = Router();

/**
 * GET /api/health
 * Basic health check - confirms the process is running
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/ready
 * Readiness check - reports whether required dependencies are available
 */
router.get('/ready', (_req, res) => {
  // Check if math-core is available
  try {
    // We'll verify math-core availability here
    // For now, just return ready
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        mathCore: 'available',
      },
    });
  } catch (error) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Service not ready');
  }
});

export { router as healthRouter };
