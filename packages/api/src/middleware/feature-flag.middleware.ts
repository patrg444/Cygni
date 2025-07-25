import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Check if a feature flag is enabled
 */
export function checkFeatureFlag(flagName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isEnabled = process.env[flagName] === 'true';
    
    if (!isEnabled) {
      logger.warn('Feature flag not enabled', {
        flag: flagName,
        userId: (req as any).user?.id,
        path: req.path,
      });
      
      return res.status(403).json({
        error: 'Feature not available',
        message: 'This feature is not enabled for your account',
        featureFlag: flagName,
      });
    }
    
    next();
  };
}

/**
 * Check if user's plan has access to a feature
 */
export function checkPlanFeature(feature: string) {
  return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const planFeatures: Record<string, string[]> = {
      free: ['basic_deployments', 'basic_monitoring'],
      starter: ['basic_deployments', 'basic_monitoring', 'custom_domains', 'team_members'],
      pro: [
        'basic_deployments',
        'basic_monitoring',
        'custom_domains',
        'team_members',
        'advanced_monitoring',
        'webhooks',
        'api_access',
      ],
      enterprise: [
        'basic_deployments',
        'basic_monitoring',
        'custom_domains',
        'team_members',
        'advanced_monitoring',
        'webhooks',
        'api_access',
        'canary_deployments',
        'blue_green_deployments',
        'saml_sso',
        'private_cloud',
        'sla_monitoring',
        'compliance_reports',
      ],
    };

    const userPlan = req.user.team?.planId || 'free';
    const allowedFeatures = planFeatures[userPlan] || planFeatures.free;

    if (!allowedFeatures.includes(feature)) {
      logger.warn('Plan feature not available', {
        feature,
        userPlan,
        userId: req.user.id,
        teamId: req.user.teamId,
      });

      return res.status(403).json({
        error: 'Feature not available in your plan',
        message: `The ${feature} feature requires an upgrade to a higher plan`,
        currentPlan: userPlan,
        requiredPlan: Object.entries(planFeatures).find(([_, features]) =>
          features.includes(feature)
        )?.[0] || 'enterprise',
      });
    }

    next();
  };
}

/**
 * Check if a feature is in beta
 */
export function checkBetaFeature(feature: string) {
  return (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    const betaUsers = (process.env.BETA_USERS || '').split(',');
    const isBetaUser = req.user && betaUsers.includes(req.user.email);
    
    if (!isBetaUser) {
      logger.info('Beta feature access denied', {
        feature,
        userId: req.user?.id,
        email: req.user?.email,
      });
      
      return res.status(403).json({
        error: 'Beta feature',
        message: 'This feature is currently in beta and not available for your account',
        feature,
      });
    }
    
    next();
  };
}

/**
 * Check multiple feature flags
 */
export function checkFeatureFlags(...flagNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const disabledFlags = flagNames.filter(flag => process.env[flag] !== 'true');
    
    if (disabledFlags.length > 0) {
      logger.warn('Multiple feature flags not enabled', {
        flags: disabledFlags,
        userId: (req as any).user?.id,
        path: req.path,
      });
      
      return res.status(403).json({
        error: 'Features not available',
        message: 'Some required features are not enabled',
        disabledFlags,
      });
    }
    
    next();
  };
}