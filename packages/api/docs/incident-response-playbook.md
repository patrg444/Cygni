# Incident Response Playbook

## Overview

This playbook provides a structured approach to handling production incidents at Cygni. It ensures consistent, efficient, and effective incident response while minimizing customer impact and improving system reliability.

## Incident Classification

### Severity Levels

#### SEV1 - Critical
- **Definition**: Complete service outage or critical functionality unavailable
- **Examples**: API down, database unreachable, payment processing failed
- **Response Time**: Immediate (< 5 minutes)
- **Notification**: Page on-call, engineering manager, VP, customers

#### SEV2 - Major
- **Definition**: Significant degradation or partial outage
- **Examples**: High error rates (>5%), slow response times, auth failures
- **Response Time**: < 15 minutes
- **Notification**: Page on-call, engineering manager

#### SEV3 - Minor
- **Definition**: Minor feature issues with workarounds available
- **Examples**: Non-critical API errors, UI glitches, delayed processing
- **Response Time**: < 1 hour
- **Notification**: Slack alert, on-call engineer

#### SEV4 - Low
- **Definition**: Cosmetic issues or minor inconveniences
- **Examples**: Typos, minor UI issues, non-blocking bugs
- **Response Time**: Next business day
- **Notification**: Ticket system

## Incident Response Process

### 1. Detection & Alert

**Automated Detection**
- Prometheus alerts fire based on thresholds
- PagerDuty/OpsGenie creates incident
- On-call engineer paged
- Slack #incidents channel notified

**Manual Detection**
- Customer report via support
- Engineer observes issue
- Create incident manually in PagerDuty

### 2. Initial Response

**First Responder Checklist**
- [ ] Acknowledge alert within SLA
- [ ] Join incident Slack channel/call
- [ ] Assess severity and impact
- [ ] Update status page if customer-facing
- [ ] Begin initial investigation

**Severity Assessment Questions**
1. Are customers completely blocked?
2. Is revenue generation affected?
3. How many customers are impacted?
4. Is data integrity at risk?
5. Are there security implications?

### 3. Incident Command Structure

**Roles and Responsibilities**

#### Incident Commander (IC)
- Overall incident coordination
- Decision making authority
- External communication approval
- Resource allocation
- Usually: On-call engineer or EM

#### Technical Lead (TL)
- Technical investigation
- Solution implementation
- Coordinate engineering efforts
- Usually: Senior engineer familiar with system

#### Communications Lead (CL)
- Status page updates
- Customer communications
- Internal updates
- Stakeholder management
- Usually: Support lead or PM

#### Scribe
- Document timeline
- Track actions taken
- Record decisions
- Capture follow-ups
- Usually: Available engineer

### 4. Communication Protocols

#### Internal Communication

**Slack Channels**
- #incidents - All active incidents
- #incident-[timestamp] - Specific incident room
- #engineering - General updates
- #customer-success - Support coordination

**Update Frequency**
- SEV1: Every 15 minutes
- SEV2: Every 30 minutes
- SEV3: Every hour
- SEV4: As needed

**Update Template**
```
UPDATE [Time]
Severity: SEV[1-4]
Status: [Investigating/Identified/Monitoring/Resolved]
Impact: [Customer impact description]
Current Actions: [What we're doing]
Next Update: [Time]
```

#### External Communication

**Status Page Updates**

SEV1 Template:
```
Title: Major Service Disruption
Status: Identified

We are currently experiencing a service disruption affecting [service].
Our engineering team has identified the issue and is working on a resolution.

Impact: [Specific impact]
Workaround: [If available]

Next update in 15 minutes.
```

**Customer Email (SEV1/2 > 30 min)**
```
Subject: [SEV1] Cygni Service Disruption - [Service Name]

Dear Customer,

We are currently experiencing issues with [service description].

Start Time: [timestamp]
Impact: [specific impact]
Current Status: [investigation/mitigation/resolution]

Our team is working with the highest priority to resolve this issue.

Updates available at: https://status.cygni.dev

We sincerely apologize for the inconvenience.

The Cygni Team
```

### 5. Investigation & Mitigation

#### Investigation Checklist

**Initial Checks**
- [ ] Check monitoring dashboards
- [ ] Review recent deployments
- [ ] Check system resources
- [ ] Review error logs
- [ ] Verify external dependencies

**Data Collection**
```bash
# Capture current state
kubectl get pods -A -o wide > pods-state.txt
kubectl get events -A > events.txt
kubectl top nodes > nodes-resources.txt
kubectl logs -n production -l app=cygni-api --tail=1000 > app-logs.txt
```

#### Mitigation Strategies

**Quick Wins**
1. Restart affected services
2. Scale up capacity
3. Enable feature flags/circuit breakers
4. Redirect traffic
5. Rollback recent changes

**Rollback Decision Tree**
```
Recent deployment? → Yes → Errors started after? → Yes → ROLLBACK
                  ↓                             ↓
                  No                            No
                  ↓                             ↓
            Config change? → Yes → Test revert → Success? → REVERT
                           ↓                              ↓
                           No                             No
                           ↓                              ↓
                     Investigate other causes
```

### 6. Resolution & Recovery

#### Resolution Confirmation
- [ ] Primary issue resolved
- [ ] Error rates normal
- [ ] Response times acceptable
- [ ] All health checks passing
- [ ] No customer complaints

#### Recovery Monitoring
- Monitor for 30 minutes post-resolution
- Watch for symptom recurrence
- Verify no side effects
- Confirm customer access restored

### 7. Post-Incident Process

#### Immediate Actions (< 24 hours)
1. Update incident ticket with resolution
2. Send all-clear communication
3. Thank incident responders
4. Schedule post-mortem meeting

#### Post-Mortem (< 48 hours)

**Post-Mortem Template**
```markdown
# Incident Post-Mortem: [Incident Title]

## Incident Summary
- Date: [Date]
- Duration: [Start] - [End] ([Total duration])
- Severity: SEV[1-4]
- Impact: [Customer/Business impact]

## Timeline
[Use UTC times]
- HH:MM - Alert fired
- HH:MM - Engineer acknowledged
- HH:MM - Root cause identified
- HH:MM - Mitigation applied
- HH:MM - Incident resolved

## Root Cause
[Technical description of what caused the incident]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Positive aspect 1]
- [Positive aspect 2]

## What Went Wrong
- [Issue 1]
- [Issue 2]

## Action Items
| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| [Action 1] | [Name] | [Date] | [P0/P1/P2] |

## Lessons Learned
[Key takeaways for the team]
```

## Escalation Procedures

### Escalation Matrix

| Time | SEV1 | SEV2 | SEV3 | SEV4 |
|------|------|------|------|------|
| 0 min | On-call | On-call | On-call | Ticket |
| 5 min | + EM | - | - | - |
| 15 min | + VP Eng | + EM | - | - |
| 30 min | + CTO | + Sr. Eng | - | - |
| 60 min | + CEO | + VP Eng | + EM | - |

### Contact Information

**PagerDuty Schedules**
- Primary: cygni-primary-oncall
- Secondary: cygni-secondary-oncall
- Management: cygni-management-escalation

**Key Contacts**
- On-Call Phone: +1-XXX-XXX-XXXX
- Engineering Manager: [Name] - [Phone]
- VP Engineering: [Name] - [Phone]
- CTO: [Name] - [Phone]

## Tools and Resources

### Incident Management Tools
- PagerDuty: https://cygni.pagerduty.com
- Status Page: https://status.cygni.dev
- Runbooks: https://docs.cygni.dev/runbooks
- Monitoring: https://grafana.cygni.dev

### Quick Commands

**Create Incident Channel**
```bash
/incident create sev1 "API Down"
```

**Page Additional Help**
```bash
/page @engineer "Need help with database"
```

**Update Status Page**
```bash
/statuspage update investigating "We are investigating API issues"
```

## Best Practices

### Do's
- ✅ Communicate early and often
- ✅ Focus on mitigation over root cause
- ✅ Document everything
- ✅ Ask for help when needed
- ✅ Keep customers informed
- ✅ Stay calm and methodical

### Don'ts
- ❌ Don't blame individuals
- ❌ Don't make rushed changes
- ❌ Don't skip communication
- ❌ Don't work in isolation
- ❌ Don't forget to follow up
- ❌ Don't hide problems

## Training and Drills

### Monthly Incident Drills
- First Thursday of each month
- Rotate incident commander role
- Practice with synthetic incidents
- Review and improve process

### Incident Response Training
- New engineer orientation
- Quarterly refresher training
- Tool and process updates
- Lessons learned sessions

## Appendix

### Useful Queries

**Recent Errors**
```sql
SELECT 
  error_type,
  COUNT(*) as count,
  MAX(created_at) as last_seen
FROM error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_type
ORDER BY count DESC;
```

**System Health Check**
```bash
#!/bin/bash
echo "=== System Health Check ==="
echo "API Health:" $(curl -s https://api.cygni.dev/health | jq -r .status)
echo "Database:" $(psql $DATABASE_URL -c "SELECT 1" &>/dev/null && echo "OK" || echo "FAIL")
echo "Redis:" $(redis-cli ping)
echo "Active Pods:" $(kubectl get pods -n production | grep Running | wc -l)
```

### Reference Links
- AWS Status: https://status.aws.amazon.com
- Stripe Status: https://status.stripe.com
- GitHub Status: https://status.github.com
- Datadog Status: https://status.datadoghq.com