import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { CanaryDeploymentService } from '../../services/deployment/canary.service';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { checkFeatureFlag } from '../../middleware/feature-flag.middleware';
import { prisma } from '../../lib/prisma';

const router = Router();
const canaryService = new CanaryDeploymentService();

/**
 * Start a canary deployment
 */
router.post(
  '/projects/:projectId/deployments/:deploymentId/canary',
  authenticate,
  authorize(['admin', 'developer']),
  checkFeatureFlag('ENABLE_CANARY_DEPLOYMENTS'),
  [
    param('projectId').isUUID(),
    param('deploymentId').isUUID(),
    body('percentage').isInt({ min: 1, max: 50 }).withMessage('Percentage must be between 1 and 50'),
    body('duration').isInt({ min: 5, max: 1440 }).withMessage('Duration must be between 5 and 1440 minutes'),
    body('successThreshold').isFloat({ min: 0.5, max: 1 }).withMessage('Success threshold must be between 0.5 and 1'),
    body('errorThreshold').isFloat({ min: 0, max: 0.5 }).withMessage('Error threshold must be between 0 and 0.5'),
    body('latencyThreshold').isInt({ min: 100 }).withMessage('Latency threshold must be at least 100ms'),
    body('autoPromote').optional().isBoolean(),
    body('autoRollback').optional().isBoolean(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { projectId, deploymentId } = req.params;
    
    // Verify user has access to project
    const hasAccess = await req.user.hasProjectAccess(projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const config = {
      percentage: req.body.percentage,
      duration: req.body.duration,
      successThreshold: req.body.successThreshold,
      errorThreshold: req.body.errorThreshold,
      latencyThreshold: req.body.latencyThreshold,
      autoPromote: req.body.autoPromote ?? false,
      autoRollback: req.body.autoRollback ?? true,
    };

    const canaryId = await canaryService.startCanaryDeployment(
      projectId,
      deploymentId,
      config
    );

    res.status(201).json({
      canaryId,
      message: 'Canary deployment started',
      config,
    });
  })
);

/**
 * Get canary deployment status
 */
router.get(
  '/canary/:canaryId',
  authenticate,
  param('canaryId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { canaryId } = req.params;
    
    const status = await canaryService.getCanaryStatus(canaryId);
    
    // Verify user has access to project
    const hasAccess = await req.user.hasProjectAccess(status.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(status);
  })
);

/**
 * Update canary traffic percentage
 */
router.patch(
  '/canary/:canaryId/traffic',
  authenticate,
  authorize(['admin', 'developer']),
  [
    param('canaryId').isUUID(),
    body('percentage').isInt({ min: 1, max: 100 }).withMessage('Percentage must be between 1 and 100'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { canaryId } = req.params;
    const { percentage } = req.body;
    
    // Get canary to verify access
    const canary = await canaryService.getCanaryStatus(canaryId);
    const hasAccess = await req.user.hasProjectAccess(canary.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await canaryService.updateCanaryTraffic(canaryId, percentage);

    res.json({
      success: true,
      message: `Canary traffic updated to ${percentage}%`,
    });
  })
);

/**
 * Promote canary deployment
 */
router.post(
  '/canary/:canaryId/promote',
  authenticate,
  authorize(['admin', 'developer']),
  param('canaryId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { canaryId } = req.params;
    
    // Get canary to verify access
    const canary = await canaryService.getCanaryStatus(canaryId);
    const hasAccess = await req.user.hasProjectAccess(canary.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await canaryService.promoteCanary(canaryId);

    res.json({
      success: true,
      message: 'Canary deployment promoted to production',
    });
  })
);

/**
 * Rollback canary deployment
 */
router.post(
  '/canary/:canaryId/rollback',
  authenticate,
  authorize(['admin', 'developer']),
  [
    param('canaryId').isUUID(),
    body('reason').notEmpty().withMessage('Rollback reason is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { canaryId } = req.params;
    const { reason } = req.body;
    
    // Get canary to verify access
    const canary = await canaryService.getCanaryStatus(canaryId);
    const hasAccess = await req.user.hasProjectAccess(canary.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await canaryService.rollbackCanary(canaryId, reason);

    res.json({
      success: true,
      message: 'Canary deployment rolled back',
      reason,
    });
  })
);

/**
 * Pause canary deployment
 */
router.post(
  '/canary/:canaryId/pause',
  authenticate,
  authorize(['admin', 'developer']),
  param('canaryId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { canaryId } = req.params;
    
    // Get canary to verify access
    const canary = await canaryService.getCanaryStatus(canaryId);
    const hasAccess = await req.user.hasProjectAccess(canary.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await canaryService.pauseCanary(canaryId);

    res.json({
      success: true,
      message: 'Canary deployment paused',
    });
  })
);

/**
 * List canary deployments for a project
 */
router.get(
  '/projects/:projectId/canaries',
  authenticate,
  [
    param('projectId').isUUID(),
    query('status').optional().isIn(['running', 'paused', 'promoted', 'rolled_back']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { status, limit = 20, offset = 0 } = req.query;
    
    // Verify user has access to project
    const hasAccess = await req.user.hasProjectAccess(projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // This would query from database in real implementation
    const canaries = await prisma.canaryDeployment.findMany({
      where: {
        projectId,
        ...(status && { status: status as string }),
      },
      orderBy: { createdAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
      include: {
        deployment: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const total = await prisma.canaryDeployment.count({
      where: {
        projectId,
        ...(status && { status: status as string }),
      },
    });

    res.json({
      canaries,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  })
);

export { router as canaryRoutes };