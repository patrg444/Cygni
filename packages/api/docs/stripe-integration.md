# Stripe Integration Guide

## Overview

Cygni uses Stripe for subscription billing and usage-based pricing. This guide covers the setup and integration details.

## Pricing Model

Cygni uses a usage-based pricing model with the following metrics:

- **Compute**: $0.05 per vCPU-hour
- **Storage**: $0.10 per GB-month  
- **Bandwidth**: $0.09 per GB
- **Requests**: $0.20 per million

All new teams get a 14-day free trial.

## Setup Instructions

### 1. Create Stripe Products and Prices

In your Stripe Dashboard:

1. Create a product called "Cygni Platform Usage"
2. Add the following metered prices:
   - Compute (per vCPU-hour)
   - Storage (per GB-month)
   - Bandwidth (per GB)
   - Requests (per million)

3. Copy the price IDs to your `.env` file:
   ```
   STRIPE_PRICE_COMPUTE=price_xxx
   STRIPE_PRICE_STORAGE=price_xxx
   STRIPE_PRICE_BANDWIDTH=price_xxx
   STRIPE_PRICE_REQUESTS=price_xxx
   ```

### 2. Configure Webhook Endpoint

1. In Stripe Dashboard, go to Developers > Webhooks
2. Add endpoint: `https://api.cygni.dev/api/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`

4. Copy the webhook secret to your `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

### 3. Test Mode vs Production

- Use test mode keys (`sk_test_`) for development
- Switch to live mode keys (`sk_live_`) for production
- Test webhook locally using Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:4000/api/webhooks/stripe
  ```

## API Endpoints

### Subscription Management

- **POST /api/billing/subscription** - Create subscription
- **GET /api/billing/subscription** - Get subscription details
- **POST /api/billing/payment-method** - Update payment method
- **POST /api/billing/portal** - Create customer portal session

### Usage Tracking

- **GET /api/billing/usage** - Get usage summary for current period
- **POST /api/billing/usage** - Report usage (internal)

### Invoices

- **GET /api/billing/invoices** - List invoices
- **GET /api/billing/invoices/:id/download** - Download invoice PDF

## Usage Reporting

Usage is reported to Stripe automatically when tracked in the database:

```javascript
// Example: Report compute usage
await fetch('/api/billing/usage', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectId: 'proj_123',
    metricType: 'compute',
    quantity: 3600, // 1 vCPU-hour in seconds
  })
});
```

## Customer Portal

Users can manage their subscription through Stripe's hosted customer portal:

```javascript
// Redirect to Stripe portal
const response = await fetch('/api/billing/portal', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { url } = await response.json();
window.location.href = url;
```

## Testing

### Test Cards

Use these test cards in development:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Simulating Events

Use Stripe CLI to trigger test events:
```bash
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_failed
```

## Security Considerations

1. Always verify webhook signatures
2. Use HTTPS for all API endpoints
3. Store sensitive data (customer IDs) encrypted
4. Implement proper access controls
5. Log all billing events for audit trail

## Monitoring

Monitor these metrics:
- Failed payment rate
- Subscription churn rate
- Average revenue per user (ARPU)
- Usage patterns by metric type
- Webhook processing failures