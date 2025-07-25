import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { BlueGreenDeploymentService } from '../../services/deployment/blue-green.service';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { checkPlanFeature } from '../../middleware/feature-flag.middleware';
import { prisma } from '../../lib/prisma';

const router = Router();
const blueGreenService = new BlueGreenDeploymentService();

/**
 * Initialize blue-green deployment
 */
router.post(
  '/projects/:projectId/deployments/:greenDeploymentId/blue-green',
  authenticate,
  authorize(['admin', 'developer']),
  checkPlanFeature('blue_green_deployments'),
  [
    param('projectId').isUUID(),
    param('greenDeploymentId').isUUID(),
    body('strategy').isIn(['immediate', 'gradual', 'canary']).withMessage('Invalid switch strategy'),
    body('switchDuration').optional().isInt({ min: 5, max: 1440 }).withMessage('Switch duration must be between 5 and 1440 minutes'),
    body('validationPeriod').optional().isInt({ min: 1, max: 60 }).withMessage('Validation period must be between 1 and 60 minutes'),
    body('autoSwitch').optional().isBoolean(),
    body('rollbackOnError').optional().isBoolean(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { projectId, greenDeploymentId } = req.params;
    
    // Verify user has access to project
    const hasAccess = await req.user.hasProjectAccess(projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const config = {
      strategy: req.body.strategy,
      switchDuration: req.body.switchDuration,
      validationPeriod: req.body.validationPeriod,
      autoSwitch: req.body.autoSwitch ?? true,
      rollbackOnError: req.body.rollbackOnError ?? true,
    };

    const blueGreenId = await blueGreenService.initializeBlueGreenDeployment(
      projectId,
      greenDeploymentId,
      config
    );

    res.status(201).json({
      blueGreenId,
      message: 'Blue-green deployment initialized',
      config,
    });
  })
);

/**
 * Get blue-green deployment status
 */
router.get(
  '/blue-green/:blueGreenId',
  authenticate,
  param('blueGreenId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { blueGreenId } = req.params;
    
    const status = await blueGreenService.getStatus(blueGreenId);
    
    // Verify user has access to project
    const hasAccess = await req.user.hasProjectAccess(status.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(status);
  })
);

/**
 * Switch traffic to green
 */
router.post(
  '/blue-green/:blueGreenId/switch',
  authenticate,
  authorize(['admin', 'developer']),
  [
    param('blueGreenId').isUUID(),
    body('percentage').optional().isInt({ min: 0, max: 100 }).withMessage('Percentage must be between 0 and 100'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { blueGreenId } = req.params;
    const { percentage } = req.body;
    
    // Get deployment to verify access
    const deployment = await blueGreenService.getStatus(blueGreenId);
    const hasAccess = await req.user.hasProjectAccess(deployment.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await blueGreenService.switchToGreen(blueGreenId, percentage);

    res.json({
      success: true,
      message: percentage 
        ? `Traffic switched: ${percentage}% to green` 
        : 'Fully switched to green deployment',
    });
  })
);

/**
 * Rollback to blue
 */
router.post(
  '/blue-green/:blueGreenId/rollback',
  authenticate,
  authorize(['admin', 'developer']),
  [
    param('blueGreenId').isUUID(),
    body('reason').notEmpty().withMessage('Rollback reason is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { blueGreenId } = req.params;
    const { reason } = req.body;
    
    // Get deployment to verify access
    const deployment = await blueGreenService.getStatus(blueGreenId);
    const hasAccess = await req.user.hasProjectAccess(deployment.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await blueGreenService.rollbackToBlue(blueGreenId, reason);

    res.json({
      success: true,
      message: 'Rolled back to blue deployment',
      reason,
    });
  })
);

/**
 * Validate green deployment health
 */
router.get(
  '/blue-green/:blueGreenId/validate',
  authenticate,
  param('blueGreenId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { blueGreenId } = req.params;
    
    // Get deployment to verify access
    const deployment = await blueGreenService.getStatus(blueGreenId);
    const hasAccess = await req.user.hasProjectAccess(deployment.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const health = await blueGreenService.validateGreenDeployment(blueGreenId);

    res.json({
      health,
      recommendation: health.healthy ? 'safe_to_switch' : 'do_not_switch',
    });
  })
);

/**
 * List blue-green deployments for a project
 */
router.get(
  '/projects/:projectId/blue-green',
  authenticate,
  [
    param('projectId').isUUID(),
    query('status').optional().isIn(['active_blue', 'active_green', 'switching', 'completed', 'paused']),
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

    const deployments = await prisma.blueGreenDeployment.findMany({
      where: {
        projectId,
        ...(status && { status: status as string }),
      },
      orderBy: { createdAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
      include: {
        blueDeployment: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        greenDeployment: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const total = await prisma.blueGreenDeployment.count({
      where: {
        projectId,
        ...(status && { status: status as string }),
      },
    });

    res.json({
      deployments,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  })
);

/**
 * Get traffic distribution
 */
router.get(
  '/blue-green/:blueGreenId/traffic',
  authenticate,
  param('blueGreenId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { blueGreenId } = req.params;
    
    // Get deployment to verify access
    const deployment = await blueGreenService.getStatus(blueGreenId);
    const hasAccess = await req.user.hasProjectAccess(deployment.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      blueGreenId,
      traffic: {
        blue: 100 - deployment.trafficToGreen,
        green: deployment.trafficToGreen,
      },
      status: deployment.status,
    });
  })
);

export { router as blueGreenRoutes };