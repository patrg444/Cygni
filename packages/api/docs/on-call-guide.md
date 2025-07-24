# On-Call Engineering Guide

## Overview

This guide provides comprehensive information for engineers serving as on-call responders for Cygni's production systems. Being on-call is a critical responsibility that ensures our platform's reliability and our customers' success.

## On-Call Responsibilities

### Primary Responsibilities

1. **Incident Response**
   - Acknowledge alerts within 5 minutes
   - Triage and assess incident severity
   - Lead or assist in incident resolution
   - Communicate status updates

2. **System Monitoring**
   - Review dashboards during shift start
   - Proactive monitoring for anomalies
   - Verify recent deployment health
   - Check scheduled maintenance

3. **Communication**
   - Update status page for customer-facing issues
   - Coordinate with team members
   - Escalate when necessary
   - Document actions taken

4. **Handoff**
   - Brief incoming on-call engineer
   - Document ongoing issues
   - Update runbooks with new findings
   - Complete handoff checklist

## On-Call Schedule

### Rotation Details
- **Duration**: 1 week (Monday 9 AM - Monday 9 AM PST)
- **Frequency**: Every 6-8 weeks per engineer
- **Coverage**: 24/7 with follow-the-sun model
- **Backup**: Secondary on-call for escalation

### Schedule Management
- View schedule: https://cygni.pagerduty.com/schedules
- Request swaps: #on-call-swaps channel
- PTO planning: 2 weeks notice minimum
- Emergency coverage: Contact engineering manager

## Before Your On-Call Shift

### Pre-Shift Checklist
- [ ] Laptop charged and accessible
- [ ] Phone charged with PagerDuty app
- [ ] VPN access confirmed
- [ ] AWS/GCP console access verified
- [ ] Review recent incidents
- [ ] Check planned maintenance
- [ ] Confirm no PTO conflicts
- [ ] Update Slack status

### Required Access
```bash
# Verify access to critical systems
./scripts/verify-oncall-access.sh

# Expected output:
✓ AWS Console access
✓ Kubernetes cluster access
✓ Database read access
✓ Monitoring dashboards
✓ PagerDuty integration
✓ Status page admin
```

### Tools Setup

**Mobile Setup**
1. Install PagerDuty mobile app
2. Configure notification settings
3. Test alert acknowledgment
4. Set custom ringtone for pages

**Desktop Setup**
1. Install PagerDuty desktop notifier
2. Configure browser notifications
3. Bookmark critical dashboards
4. Set up terminal aliases

## During Your On-Call Shift

### Daily Routine

**Morning Check (9 AM)**
```bash
# Run daily health check
./scripts/oncall-daily-check.sh

# Review overnight alerts
pagerduty-cli incidents list --since="8 hours ago"

# Check system metrics
open https://grafana.cygni.dev/d/oncall-overview
```

**Afternoon Check (2 PM)**
- Review deployment pipeline
- Check scheduled jobs status
- Verify backup completion
- Monitor peak traffic patterns

**Evening Check (6 PM)**
- Handoff to APAC if applicable
- Review business hours incidents
- Update status page if needed
- Check next day's maintenance

### Alert Response

#### Alert Acknowledgment
1. Acknowledge within 5 minutes
2. Join #incidents channel
3. Assess severity and impact
4. Begin investigation

#### Initial Actions
```bash
# Quick system status
curl https://api.cygni.dev/health | jq .

# View recent errors
kubectl logs -n production -l app=cygni-api --tail=50 | grep ERROR

# Check current load
kubectl top pods -n production

# Database status
psql $DATABASE_URL -c "SELECT pg_database_size('cygni')"
```

### Common Scenarios

#### High Traffic Event
```bash
# Scale up immediately
kubectl scale deployment cygni-api -n production --replicas=20

# Enable caching
kubectl set env deployment/cygni-api -n production AGGRESSIVE_CACHE=true

# Monitor scaling
watch kubectl get hpa -n production
```

#### Database Issues
```sql
-- Check connections
SELECT count(*) FROM pg_stat_activity;

-- Kill long queries
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state != 'idle' 
  AND query_start < now() - interval '5 minutes';

-- Check locks
SELECT * FROM pg_locks WHERE NOT granted;
```

#### Deployment Problems
```bash
# Quick rollback
kubectl rollout undo deployment/cygni-api -n production

# Check rollout status
kubectl rollout status deployment/cygni-api -n production

# View deployment history
kubectl rollout history deployment/cygni-api -n production
```

## Escalation Guidelines

### When to Escalate

**Escalate Immediately**
- SEV1 incidents unresolved after 15 minutes
- Customer data at risk
- Security incidents
- Multiple systems affected
- Need additional expertise

**Escalation Path**
1. Secondary on-call (backup)
2. Engineering Manager
3. VP of Engineering
4. CTO

### How to Escalate

**Via PagerDuty**
```bash
# Add responder to incident
pagerduty-cli incident add-responder <incident-id> <user-email>

# Escalate to next level
pagerduty-cli incident escalate <incident-id>
```

**Via Slack**
```
@here SEV1 incident needs escalation
Incident: [PD link]
Issue: [Brief description]
Tried: [What you've attempted]
Need: [What help you need]
```

## Communication Templates

### Status Page Updates

**Investigating**
```
We are investigating reports of [issue description].
Our engineering team is looking into this with the highest priority.
```

**Identified**
```
We have identified the cause of [issue description].
A fix is being implemented. We expect resolution within [timeframe].
```

**Monitoring**
```
A fix has been implemented for [issue description].
We are monitoring the results and will provide a final update shortly.
```

**Resolved**
```
The issue with [service] has been resolved.
All systems are operating normally. We apologize for any inconvenience.
```

### Customer Communication

**Proactive Notification**
```
Subject: Cygni Platform - Service Alert

We are currently experiencing [issue] affecting [service].

Impact: [Specific impact]
Status: Our team is actively working on resolution
ETA: [Timeframe if known]

Updates at: https://status.cygni.dev

We apologize for the inconvenience.
```

### Internal Updates

**Slack Update Format**
```
🚨 UPDATE [HH:MM UTC]
Severity: SEV2
Service: API/Database/Auth
Status: Investigating/Mitigating/Resolved
Impact: X customers affected
Actions: [Current actions]
Next: [Next steps]
ETA: [Resolution estimate]
```

## Handoff Procedures

### End of Shift Handoff

**Handoff Checklist**
- [ ] No unacknowledged alerts
- [ ] Document ongoing issues
- [ ] Update incident tickets
- [ ] Brief incoming on-call
- [ ] Transfer any in-progress work
- [ ] Update team in Slack

**Handoff Template**
```markdown
## On-Call Handoff - [Date]

**Outgoing**: @engineer1
**Incoming**: @engineer2

### Active Issues
- [Issue 1]: Status, next steps
- [Issue 2]: Status, next steps

### Recent Incidents
- [PD-123]: Resolved, monitor for recurrence
- [PD-124]: Post-mortem scheduled

### Scheduled Maintenance
- [Date/Time]: Database upgrade
- [Date/Time]: Certificate renewal

### Notes
- Customer X reported intermittent errors - watching
- Deployment pipeline slow - investigating with Platform team

### Metrics
- Alerts received: 12
- Incidents handled: 3
- Escalations: 1
```

## Best Practices

### Do's
- ✅ Stay calm during incidents
- ✅ Over-communicate status
- ✅ Ask for help early
- ✅ Document everything
- ✅ Learn from each incident
- ✅ Keep phone charged
- ✅ Test changes carefully

### Don'ts
- ❌ Don't panic
- ❌ Don't make assumptions
- ❌ Don't skip runbooks
- ❌ Don't debug in production
- ❌ Don't ignore small alerts
- ❌ Don't work beyond fatigue
- ❌ Don't blame others

## On-Call Wellness

### Managing Stress
- Take breaks between incidents
- Step outside for fresh air
- Practice breathing exercises
- Debrief with team after tough incidents
- Use comp time after difficult shifts

### Work-Life Balance
- Set boundaries with non-urgent requests
- Use Do Not Disturb outside alerts
- Take comp time after overnight incidents
- Delegate when overwhelmed
- Communicate availability clearly

### Post-Incident Self-Care
- Decompress after major incidents
- Share experiences in retros
- Take breaks as needed
- Celebrate successful resolutions
- Learn without self-blame

## Resources

### Quick References
- Runbooks: /docs/runbooks/
- Architecture: /docs/architecture/
- API Docs: https://api.cygni.dev/docs
- Admin Panel: https://admin.cygni.dev

### Dashboards
- System Overview: https://grafana.cygni.dev/d/system
- API Metrics: https://grafana.cygni.dev/d/api
- Database: https://grafana.cygni.dev/d/postgres
- Business Metrics: https://grafana.cygni.dev/d/business

### Emergency Contacts
- AWS Support: 1-800-xxx-xxxx
- Stripe Support: support@stripe.com
- Datadog Support: support@datadoghq.com
- Security Team: security@cygni.dev

### Useful Aliases
```bash
# Add to ~/.bashrc or ~/.zshrc
alias k='kubectl'
alias kprod='kubectl -n production'
alias logs='kubectl logs -n production -f'
alias pods='kubectl get pods -n production'
alias incidents='pagerduty-cli incidents list'
alias oncall='pagerduty-cli oncall show'
```

## Compensation

### On-Call Pay
- Base on-call stipend: $500/week
- Incident response: Time and a half
- Weekend incidents: Double time
- Holiday coverage: Triple time

### Time Off
- Comp day after overnight incident (> 2 hours)
- Half day after multiple night alerts
- Flexible schedule during on-call week
- No meetings during post-incident recovery

## Feedback and Improvements

### Continuous Improvement
- Weekly on-call retro
- Quarterly process review
- Runbook updates after incidents
- Tool and automation improvements

### Feedback Channels
- #on-call-feedback Slack channel
- Monthly on-call survey
- 1:1s with engineering manager
- Incident post-mortems

Remember: Being on-call is a team effort. We support each other, learn from incidents, and continuously improve our systems and processes. Your well-being matters - never hesitate to ask for help or escalate when needed.