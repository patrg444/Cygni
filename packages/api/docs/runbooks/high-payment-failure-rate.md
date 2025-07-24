# Runbook: High Payment Failure Rate

**Alert Name**: High Payment Failure Rate  
**Severity**: Critical  
**Threshold**: Payment failure rate > 10% for 15 minutes  

## Overview

This alert indicates that more than 10% of payment attempts are failing. This directly impacts revenue and customer experience, requiring immediate attention to identify whether the issue is with our integration, Stripe's services, or customer payment methods.

## Impact

### User Impact
- Failed subscription renewals
- Unable to upgrade plans
- Failed usage billing
- Account suspension risk

### Business Impact
- Direct revenue loss
- Increased churn risk
- Customer support burden
- Reputation damage

### Technical Impact
- Stripe API errors
- Webhook processing delays
- Database inconsistencies
- Billing queue backlog

## Diagnosis

### 1. Immediate Checks

```bash
# Check payment metrics
curl -s http://localhost:4000/metrics | grep payment

# Check Stripe webhook status
curl -s http://localhost:4000/metrics | grep stripe_webhook

# View recent payment errors
kubectl logs -n production -l app=cygni-api --tail=500 | grep -i "stripe\|payment" | grep -i "error\|fail"

# Check Stripe service status
curl -s https://status.stripe.com/api/v2/status.json | jq .
```

### 2. Identify Failure Patterns

```sql
-- Recent payment failures by type
SELECT 
  error_code,
  error_message,
  COUNT(*) as count
FROM payment_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND status = 'failed'
GROUP BY error_code, error_message
ORDER BY count DESC;

-- Failure rate by plan
SELECT 
  t.plan_id,
  COUNT(CASE WHEN p.status = 'failed' THEN 1 END) as failures,
  COUNT(*) as total,
  ROUND(COUNT(CASE WHEN p.status = 'failed' THEN 1 END) * 100.0 / COUNT(*), 2) as failure_rate
FROM payments p
JOIN teams t ON p.team_id = t.id
WHERE p.created_at > NOW() - INTERVAL '1 hour'
GROUP BY t.plan_id;

-- Check webhook processing lag
SELECT 
  event_type,
  AVG(processed_at - created_at) as avg_lag,
  MAX(processed_at - created_at) as max_lag,
  COUNT(*) as count
FROM stripe_webhooks
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

### 3. Common Failure Types

1. **Card Errors**
   - `card_declined` - Insufficient funds or bank rejection
   - `expired_card` - Card expiration
   - `incorrect_cvc` - Wrong security code
   - `processing_error` - Bank processing issues

2. **Integration Errors**
   - `api_key_expired` - Stripe API key issues
   - `rate_limit` - Too many requests
   - `invalid_request` - Malformed requests
   - `api_connection_error` - Network issues

3. **Configuration Errors**
   - Wrong price IDs
   - Invalid customer IDs
   - Missing payment methods
   - Webhook signature mismatch

## Resolution

### Immediate Mitigation

1. **Check Stripe Configuration**
```bash
# Verify API keys are valid
kubectl get secret -n production stripe-secrets -o yaml

# Test Stripe connectivity
kubectl exec -it -n production deployment/cygni-api -- curl \
  -u "$STRIPE_SECRET_KEY:" \
  https://api.stripe.com/v1/charges?limit=1

# Verify webhook endpoint
curl -X POST https://api.cygni.dev/api/webhooks/stripe \
  -H "Stripe-Signature: test" \
  -d '{}'
```

2. **Retry Failed Payments**
```typescript
// Script to retry recent failures
const retryFailedPayments = async () => {
  const failures = await prisma.payment.findMany({
    where: {
      status: 'failed',
      created_at: { gte: new Date(Date.now() - 3600000) },
      error_code: { in: ['processing_error', 'api_connection_error'] }
    }
  });

  for (const payment of failures) {
    await stripeService.retryPayment(payment.id);
  }
};
```

3. **Enable Fallback Mode**
```bash
# Queue payments for later processing
kubectl set env deployment/cygni-api -n production \
  PAYMENT_QUEUE_MODE=true \
  PAYMENT_RETRY_ENABLED=true
```

4. **Scale Payment Workers**
```bash
# Increase payment processing capacity
kubectl scale deployment payment-worker -n production --replicas=10
```

### Root Cause Analysis

1. **Analyze Error Distribution**
```sql
-- Error timeline
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  error_code,
  COUNT(*) as failures
FROM payment_attempts
WHERE created_at > NOW() - INTERVAL '6 hours'
  AND status = 'failed'
GROUP BY minute, error_code
ORDER BY minute DESC;

-- Customer impact
SELECT 
  COUNT(DISTINCT team_id) as affected_teams,
  COUNT(DISTINCT customer_id) as affected_customers,
  SUM(amount) / 100.0 as revenue_at_risk
FROM payment_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND status = 'failed';
```

2. **Check Integration Health**
```bash
# Verify webhook signatures
tail -f /var/log/cygni/webhooks.log | grep signature

# Check for rate limiting
kubectl logs -n production -l app=cygni-api | grep "429\|rate.limit"

# Verify price configurations
kubectl exec -it -n production deployment/cygni-api -- node -e "
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  stripe.prices.list({ limit: 10 }).then(console.log);
"
```

### Long-term Fixes

1. **Payment Retry Logic**
   - Implement exponential backoff
   - Categorize retriable vs non-retriable errors
   - Add smart retry scheduling

2. **Payment Method Management**
   - Proactive card expiration warnings
   - Multiple payment methods per customer
   - Automatic payment method updating

3. **Monitoring Improvements**
   - Real-time payment success dashboard
   - Anomaly detection for failure spikes
   - Customer-specific payment health

## Prevention

### Code Improvements
- [ ] Implement circuit breakers for Stripe API
- [ ] Add request retry with backoff
- [ ] Cache price and product data
- [ ] Validate payment data before API calls
- [ ] Add payment event sourcing

### Infrastructure
- [ ] Separate payment processing queue
- [ ] Dedicated Stripe API rate limit monitoring
- [ ] Webhook processing redundancy
- [ ] Payment retry job scheduler

### Customer Experience
- [ ] Payment failure email templates
- [ ] In-app payment update prompts
- [ ] Grace period for failed payments
- [ ] Self-service payment retry

## Communication

### Customer Communication Template
```
Subject: Action Required: Payment Update Needed

We were unable to process your recent payment for Cygni.

Error: [SPECIFIC ERROR]
Amount: $[AMOUNT]
Plan: [PLAN NAME]

Please update your payment method to avoid service interruption:
https://app.cygni.dev/settings/billing

Your service will continue uninterrupted for 3 days while we retry.

Need help? Reply to this email or visit our support center.
```

### Internal Communication
- Slack: #payments-alerts channel
- PagerDuty: Auto-escalate after 30 minutes
- Finance team notification if > $10k affected

## Post-Incident

### Recovery Verification
```sql
-- Verify payment recovery
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as succeeded,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  ROUND(COUNT(CASE WHEN status = 'succeeded' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM payment_attempts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Check revenue recovery
SELECT 
  SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) / 100.0 as revenue_recovered,
  SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) / 100.0 as revenue_at_risk
FROM payment_retry_attempts
WHERE original_payment_date > NOW() - INTERVAL '24 hours';
```

### Required Actions
1. Calculate total revenue impact
2. List of affected customers for follow-up
3. Review and update payment retry strategy
4. Update monitoring thresholds if needed

## Related Runbooks
- [Webhook Processing Failures](./webhook-processing-failures.md)
- [High Error Rate](./high-error-rate.md)
- [External Service Degraded](./external-service-degraded.md)

## Stripe Error Reference

### Common Error Codes
- `card_declined` - Generic decline, contact bank
- `insufficient_funds` - Not enough balance
- `expired_card` - Card has expired
- `incorrect_cvc` - Wrong CVV/CVC code
- `processing_error` - Temporary issue, retry
- `rate_limit` - Too many requests
- `authentication_required` - 3D Secure needed

### Stripe Dashboard Links
- Failed Payments: https://dashboard.stripe.com/payments?status=failed
- Webhook Events: https://dashboard.stripe.com/webhooks/events
- API Logs: https://dashboard.stripe.com/logs
- Radar Rules: https://dashboard.stripe.com/radar/rules