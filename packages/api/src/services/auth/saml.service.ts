import { Request, Response } from 'express';
import * as saml2 from 'saml2-js';
import { prisma } from '../../lib/prisma';
import { generateToken } from './jwt.service';
import { logger } from '../../lib/logger';
import { AuditService } from '../audit/audit.service';

interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
  identifierFormat?: string;
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
}

interface SAMLProfile {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  attributes?: Record<string, any>;
}

export class SAMLService {
  private auditService: AuditService;
  private serviceProviders: Map<string, saml2.ServiceProvider> = new Map();

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Configure SAML for a team
   */
  async configureSAML(teamId: string, config: SAMLConfig): Promise<void> {
    try {
      // Validate configuration
      this.validateConfig(config);

      // Store SAML configuration in database
      await prisma.sAMLConfig.upsert({
        where: { teamId },
        update: {
          entryPoint: config.entryPoint,
          issuer: config.issuer,
          certificate: config.cert,
          identifierFormat: config.identifierFormat,
          signatureAlgorithm: config.signatureAlgorithm,
          digestAlgorithm: config.digestAlgorithm,
          updatedAt: new Date(),
        },
        create: {
          teamId,
          entryPoint: config.entryPoint,
          issuer: config.issuer,
          certificate: config.cert,
          identifierFormat: config.identifierFormat,
          signatureAlgorithm: config.signatureAlgorithm,
          digestAlgorithm: config.digestAlgorithm,
        },
      });

      // Create service provider
      const sp = this.createServiceProvider(teamId, config);
      this.serviceProviders.set(teamId, sp);

      await this.auditService.log({
        action: 'saml.configured',
        userId: 'system',
        teamId,
        metadata: { issuer: config.issuer },
      });

      logger.info('SAML configured for team', { teamId });
    } catch (error) {
      logger.error('Failed to configure SAML', { teamId, error });
      throw error;
    }
  }

  /**
   * Generate SAML login URL
   */
  async generateLoginURL(teamId: string): Promise<string> {
    const config = await this.getConfig(teamId);
    if (!config) {
      throw new Error('SAML not configured for this team');
    }

    const sp = await this.getServiceProvider(teamId);
    
    return new Promise((resolve, reject) => {
      sp.create_login_request_url(
        this.getIdentityProvider(config),
        {},
        (err: Error | null, login_url: string) => {
          if (err) {
            reject(err);
          } else {
            resolve(login_url);
          }
        }
      );
    });
  }

  /**
   * Handle SAML callback
   */
  async handleCallback(req: Request, res: Response): Promise<void> {
    try {
      const teamId = req.params.teamId;
      const sp = await this.getServiceProvider(teamId);
      const config = await this.getConfig(teamId);
      
      if (!config) {
        throw new Error('SAML not configured');
      }

      const idp = this.getIdentityProvider(config);

      sp.post_assert(idp, {
        request_body: req.body,
      }, async (err: Error | null, saml_response: any) => {
        if (err) {
          logger.error('SAML assertion failed', { teamId, error: err });
          return res.redirect(`/login?error=saml_failed`);
        }

        try {
          const profile = this.extractProfile(saml_response);
          const user = await this.findOrCreateUser(teamId, profile);
          
          // Generate JWT token
          const token = generateToken({
            userId: user.id,
            email: user.email,
            teamId,
            role: user.role,
          });

          // Log successful login
          await this.auditService.log({
            action: 'auth.saml_login',
            userId: user.id,
            teamId,
            metadata: {
              email: user.email,
              provider: config.issuer,
            },
          });

          // Redirect to dashboard with token
          res.redirect(`${process.env.DASHBOARD_URL}/auth/callback?token=${token}`);
        } catch (error) {
          logger.error('Failed to process SAML response', { teamId, error });
          res.redirect(`/login?error=saml_processing_failed`);
        }
      });
    } catch (error) {
      logger.error('SAML callback error', { error });
      res.redirect(`/login?error=saml_error`);
    }
  }

  /**
   * Get SAML metadata for service provider
   */
  async getMetadata(teamId: string): Promise<string> {
    const sp = await this.getServiceProvider(teamId);
    return sp.create_metadata();
  }

  /**
   * Validate SAML configuration
   */
  private validateConfig(config: SAMLConfig): void {
    if (!config.entryPoint || !config.issuer || !config.cert) {
      throw new Error('Missing required SAML configuration');
    }

    // Validate certificate format
    if (!config.cert.includes('BEGIN CERTIFICATE')) {
      throw new Error('Invalid certificate format');
    }

    // Validate URL format
    try {
      new URL(config.entryPoint);
    } catch {
      throw new Error('Invalid entry point URL');
    }
  }

  /**
   * Create service provider instance
   */
  private createServiceProvider(teamId: string, _config: SAMLConfig): saml2.ServiceProvider {
    return new saml2.ServiceProvider({
      entity_id: `${process.env.API_URL}/api/v2/auth/saml/${teamId}/metadata`,
      private_key: process.env.SAML_PRIVATE_KEY!,
      certificate: process.env.SAML_CERTIFICATE!,
      assert_endpoint: `${process.env.API_URL}/api/v2/auth/saml/${teamId}/callback`,
      allow_unencrypted_assertion: process.env.NODE_ENV === 'development',
    });
  }

  /**
   * Get identity provider configuration
   */
  private getIdentityProvider(config: any): saml2.IdentityProvider {
    return new saml2.IdentityProvider({
      sso_login_url: config.entryPoint,
      sso_logout_url: config.logoutUrl || config.entryPoint,
      certificates: [config.certificate],
      sign_get_request: true,
      allow_unencrypted_assertion: process.env.NODE_ENV === 'development',
    });
  }

  /**
   * Extract user profile from SAML response
   */
  private extractProfile(samlResponse: any): SAMLProfile {
    const attributes = samlResponse.user.attributes || {};
    
    return {
      id: samlResponse.user.name_id,
      email: attributes.email?.[0] || samlResponse.user.name_id,
      name: attributes.name?.[0],
      firstName: attributes.firstName?.[0],
      lastName: attributes.lastName?.[0],
      groups: attributes.groups || [],
      attributes,
    };
  }

  /**
   * Find or create user from SAML profile
   */
  private async findOrCreateUser(teamId: string, profile: SAMLProfile) {
    let user = await prisma.user.findFirst({
      where: {
        email: profile.email,
        teamId,
      },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name || `${profile.firstName} ${profile.lastName}`.trim(),
          teamId,
          authProvider: 'saml',
          emailVerified: true, // SAML users are pre-verified
          role: this.mapGroupsToRole(profile.groups),
        },
      });

      await this.auditService.log({
        action: 'user.created_via_saml',
        userId: user.id,
        teamId,
        metadata: {
          email: user.email,
          groups: profile.groups,
        },
      });
    } else {
      // Update existing user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: profile.name || user.name,
          lastLoginAt: new Date(),
          role: this.mapGroupsToRole(profile.groups),
        },
      });
    }

    return user;
  }

  /**
   * Map SAML groups to application role
   */
  private mapGroupsToRole(groups?: string[]): string {
    if (!groups || groups.length === 0) {
      return 'member';
    }

    // Check for admin groups
    const adminGroups = ['admins', 'administrators', 'owners'];
    if (groups.some(g => adminGroups.includes(g.toLowerCase()))) {
      return 'admin';
    }

    // Check for developer groups
    const devGroups = ['developers', 'engineers', 'dev'];
    if (groups.some(g => devGroups.includes(g.toLowerCase()))) {
      return 'developer';
    }

    return 'member';
  }

  /**
   * Get SAML configuration for team
   */
  private async getConfig(teamId: string) {
    return prisma.sAMLConfig.findUnique({
      where: { teamId },
    });
  }

  /**
   * Get or create service provider
   */
  private async getServiceProvider(teamId: string): Promise<saml2.ServiceProvider> {
    let sp = this.serviceProviders.get(teamId);
    
    if (!sp) {
      const config = await this.getConfig(teamId);
      if (!config) {
        throw new Error('SAML not configured');
      }
      
      sp = this.createServiceProvider(teamId, {
        entryPoint: config.entryPoint,
        issuer: config.issuer,
        cert: config.certificate,
        identifierFormat: config.identifierFormat || undefined,
        signatureAlgorithm: config.signatureAlgorithm || undefined,
        digestAlgorithm: config.digestAlgorithm || undefined,
      });
      
      this.serviceProviders.set(teamId, sp);
    }
    
    return sp;
  }

  /**
   * Remove SAML configuration
   */
  async removeSAML(teamId: string): Promise<void> {
    await prisma.sAMLConfig.delete({
      where: { teamId },
    });

    this.serviceProviders.delete(teamId);

    await this.auditService.log({
      action: 'saml.removed',
      userId: 'system',
      teamId,
    });
  }
}