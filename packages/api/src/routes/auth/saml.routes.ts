import { Router } from 'express';
import { body, param } from 'express-validator';
import { SAMLService } from '../../services/auth/saml.service';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();
const samlService = new SAMLService();

/**
 * Configure SAML for a team (Admin only)
 */
router.post(
  '/teams/:teamId/saml',
  authenticate,
  authorize(['admin']),
  [
    param('teamId').isUUID(),
    body('entryPoint').isURL().withMessage('Entry point must be a valid URL'),
    body('issuer').notEmpty().withMessage('Issuer is required'),
    body('certificate').notEmpty().withMessage('Certificate is required'),
    body('identifierFormat').optional().isString(),
    body('signatureAlgorithm').optional().isString(),
    body('digestAlgorithm').optional().isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    
    // Verify user belongs to team
    if (req.user.teamId !== teamId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await samlService.configureSAML(teamId, req.body);

    res.json({
      success: true,
      message: 'SAML configuration saved',
      metadataUrl: `/api/v2/auth/saml/${teamId}/metadata`,
    });
  })
);

/**
 * Get SAML metadata
 */
router.get(
  '/saml/:teamId/metadata',
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const metadata = await samlService.getMetadata(teamId);
    
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  })
);

/**
 * Initiate SAML login
 */
router.get(
  '/saml/:teamId/login',
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const loginUrl = await samlService.generateLoginURL(teamId);
    res.redirect(loginUrl);
  })
);

/**
 * SAML callback endpoint
 */
router.post(
  '/saml/:teamId/callback',
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    await samlService.handleCallback(req, res);
  })
);

/**
 * Get SAML configuration (Admin only)
 */
router.get(
  '/teams/:teamId/saml',
  authenticate,
  authorize(['admin']),
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    
    if (req.user.teamId !== teamId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const config = await samlService['getConfig'](teamId);
    
    if (!config) {
      return res.status(404).json({ error: 'SAML not configured' });
    }

    // Don't expose sensitive data
    res.json({
      enabled: true,
      issuer: config.issuer,
      entryPoint: config.entryPoint,
      identifierFormat: config.identifierFormat,
      loginUrl: `/api/v2/auth/saml/${teamId}/login`,
      metadataUrl: `/api/v2/auth/saml/${teamId}/metadata`,
    });
  })
);

/**
 * Remove SAML configuration (Admin only)
 */
router.delete(
  '/teams/:teamId/saml',
  authenticate,
  authorize(['admin']),
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    
    if (req.user.teamId !== teamId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await samlService.removeSAML(teamId);
    
    res.json({
      success: true,
      message: 'SAML configuration removed',
    });
  })
);

/**
 * Test SAML connection (Admin only)
 */
router.post(
  '/teams/:teamId/saml/test',
  authenticate,
  authorize(['admin']),
  param('teamId').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    
    if (req.user.teamId !== teamId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const loginUrl = await samlService.generateLoginURL(teamId);
      res.json({
        success: true,
        loginUrl,
        message: 'SAML configuration is valid',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'SAML configuration test failed',
        details: error.message,
      });
    }
  })
);

export { router as samlRoutes };