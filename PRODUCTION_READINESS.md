# Production Readiness Checklist

This checklist helps you ensure your Cygni deployment is ready for production workloads. Use this before going live with critical applications.

## ✅ Platform Requirements

### Infrastructure Setup

- [ ] AWS account with appropriate service limits
- [ ] VPC configured with private subnets
- [ ] RDS PostgreSQL instance (or managed alternative)
- [ ] Redis cluster for caching/sessions
- [ ] S3 buckets for assets and backups
- [ ] CloudFront distribution (optional but recommended)

### Security Configuration

- [ ] SSL certificates provisioned for all domains
- [ ] WAF rules configured (if applicable)
- [ ] Security groups reviewed and locked down
- [ ] Database encrypted at rest
- [ ] Secrets stored in AWS Secrets Manager
- [ ] IAM roles follow least-privilege principle

### Monitoring & Observability

- [ ] CloudWatch alarms configured
- [ ] Log aggregation set up
- [ ] APM solution integrated (Datadog/New Relic)
- [ ] Health check endpoints verified
- [ ] Custom metrics defined
- [ ] Runbook for common issues

## 🚀 Application Checklist

### Pre-Deployment Verification

```bash
# Run these checks before production deployment
cx doctor                    # Check environment configuration
cx validate                  # Validate application config
cx deploy --dry-run         # Preview deployment changes
```

### Configuration

- [ ] Environment variables set for production
- [ ] Database migrations tested and reversible
- [ ] Resource limits appropriate for load
- [ ] Auto-scaling policies configured
- [ ] Health check paths return quickly
- [ ] Graceful shutdown implemented

### Performance

- [ ] Application starts in < 30 seconds
- [ ] Health checks respond in < 1 second
- [ ] Static assets served from CDN
- [ ] Database queries optimized (< 100ms)
- [ ] API response times < 200ms p95
- [ ] Memory usage stable under load

## 🔐 Security Checklist

### Authentication & Authorization

- [ ] Strong password requirements enforced
- [ ] Session timeout configured
- [ ] RBAC roles properly assigned
- [ ] API keys rotated regularly
- [ ] OAuth providers configured (if used)
- [ ] 2FA enabled for admin accounts

### Data Protection

- [ ] PII data encrypted in database
- [ ] Backups automated and tested
- [ ] GDPR compliance verified (if applicable)
- [ ] Data retention policies implemented
- [ ] Audit logs enabled and monitored
- [ ] Sensitive data masked in logs

### Network Security

- [ ] HTTPS enforced everywhere
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] DDoS protection active
- [ ] SQL injection prevention tested
- [ ] XSS protection headers set

## 📊 Operational Readiness

### Deployment Process

- [ ] Blue-green deployment tested
- [ ] Rollback procedure documented
- [ ] Deployment notifications configured
- [ ] Change management process defined
- [ ] Post-deployment verification automated
- [ ] Deployment window scheduled

### Incident Response

- [ ] On-call rotation established
- [ ] Escalation path defined
- [ ] Communication channels ready
- [ ] Status page configured
- [ ] Incident playbooks written
- [ ] Post-mortem process defined

### Business Continuity

- [ ] Backup restoration tested
- [ ] Disaster recovery plan documented
- [ ] RTO/RPO defined and tested
- [ ] Multi-region failover ready (if required)
- [ ] Data export functionality verified
- [ ] Vendor contact information current

## 🎯 Performance Targets

### Availability

- [ ] 99.9% uptime SLA achievable
- [ ] Health checks from multiple regions
- [ ] Automated failover tested
- [ ] Circuit breakers configured
- [ ] Retry logic implemented
- [ ] Timeout values appropriate

### Scalability

- [ ] Load tested to 2x expected traffic
- [ ] Auto-scaling tested under load
- [ ] Database connection pooling optimized
- [ ] Cache hit rates > 80%
- [ ] CDN cache headers configured
- [ ] Background job queues monitored

### Cost Management

- [ ] Budget alerts configured
- [ ] Cost allocation tags applied
- [ ] Reserved instances evaluated
- [ ] Unused resources identified
- [ ] Right-sizing completed
- [ ] Spot instances considered (where appropriate)

## 📋 Compliance Requirements

### Regulatory

- [ ] SOC2 controls implemented
- [ ] HIPAA compliance (if healthcare)
- [ ] PCI compliance (if payments)
- [ ] Data residency requirements met
- [ ] Privacy policy updated
- [ ] Terms of service current

### Internal Policies

- [ ] Code review process followed
- [ ] Security scan passed
- [ ] Documentation complete
- [ ] Training materials prepared
- [ ] Handover completed
- [ ] Sign-off obtained

## 🚦 Go-Live Checklist

### Final Verification

```bash
# Last checks before go-live
cx status --production      # Verify all systems green
cx health --all            # Check all health endpoints
cx metrics --last-hour     # Review recent metrics
```

### Launch Steps

1. [ ] Create deployment tag in git
2. [ ] Deploy to production with `cx deploy --production`
3. [ ] Monitor deployment progress
4. [ ] Verify health checks passing
5. [ ] Run smoke tests
6. [ ] Update DNS if needed
7. [ ] Monitor for 30 minutes
8. [ ] Announce go-live

### Post-Launch

- [ ] Monitor error rates for 24 hours
- [ ] Review performance metrics
- [ ] Gather team feedback
- [ ] Document lessons learned
- [ ] Plan optimization sprint
- [ ] Celebrate! 🎉

## 📞 Emergency Contacts

Keep these handy during launch:

- **Cygni Support**: support@cygni.dev
- **AWS Support**: [Your support plan contact]
- **Database Admin**: [Contact info]
- **Security Team**: [Contact info]
- **Business Owner**: [Contact info]

## 🔄 Rollback Procedure

If issues arise:

```bash
# Immediate rollback
cx rollback --production

# Verify rollback
cx status --production
cx health --all

# Investigate issues
cx logs --production --since 1h
cx metrics --anomalies
```

Remember: It's better to rollback and diagnose than to debug in production!

---

**Need help?** Join our [Discord community](https://discord.gg/cygni) or email support@cygni.dev
