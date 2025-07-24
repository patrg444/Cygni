# Webhooks

## Overview

Cygni webhooks allow you to receive real-time HTTP notifications when events occur in your projects. This enables you to build integrations and automate workflows based on deployment status, alerts, billing events, and more.

## Features

- **Real-time notifications** - Receive events as they happen
- **Reliable delivery** - Automatic retries with exponential backoff
- **Secure** - HMAC signatures for request verification
- **Flexible** - Subscribe to specific event types
- **Detailed logs** - Track delivery status and debug issues

## Getting Started

### 1. Create a Webhook Endpoint

First, create an endpoint in your application that can receive POST requests:

```javascript
app.post('/webhooks/cygni', (req, res) => {
  const event = req.body;
  
  // Verify signature (see security section)
  if (!verifyWebhookSignature(req)) {
    return res.status(401).send('Unauthorized');
  }
  
  // Process event based on type
  switch (event.type) {
    case 'deployment.succeeded':
      console.log('Deployment succeeded:', event.data);
      break;
    case 'alert.triggered':
      console.log('Alert triggered:', event.data);
      break;
  }
  
  // Return 200 to acknowledge receipt
  res.status(200).send('OK');
});
```

### 2. Register Your Webhook

Create a webhook via the API:

```bash
curl -X POST https://api.cygni.dev/api/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/cygni",
    "events": ["deployment.succeeded", "deployment.failed"],
    "description": "Production deployment notifications"
  }'
```

Response:
```json
{
  "id": "whk_123456",
  "url": "https://your-app.com/webhooks/cygni",
  "events": ["deployment.succeeded", "deployment.failed"],
  "signingSecret": "whsec_a1b2c3d4e5f6...",
  "enabled": true
}
```

**Important**: Save the `signingSecret` - it's only shown once and is used to verify webhook requests.

## Event Types

### Deployment Events

| Event | Description |
|-------|-------------|
| `deployment.created` | New deployment started |
| `deployment.updated` | Deployment status changed |
| `deployment.succeeded` | Deployment completed successfully |
| `deployment.failed` | Deployment failed |
| `deployment.cancelled` | Deployment was cancelled |

### Project Events

| Event | Description |
|-------|-------------|
| `project.created` | New project created |
| `project.updated` | Project settings updated |
| `project.deleted` | Project deleted |
| `project.suspended` | Project suspended (e.g., budget exceeded) |
| `project.resumed` | Project resumed |

### Alert Events

| Event | Description |
|-------|-------------|
| `alert.triggered` | Alert condition met |
| `alert.resolved` | Alert resolved |

### Billing Events

| Event | Description |
|-------|-------------|
| `billing.payment_succeeded` | Payment processed successfully |
| `billing.payment_failed` | Payment failed |
| `billing.subscription_created` | New subscription created |
| `billing.subscription_updated` | Subscription plan changed |
| `billing.subscription_cancelled` | Subscription cancelled |
| `billing.usage_limit_exceeded` | Usage limit exceeded |

### Team Events

| Event | Description |
|-------|-------------|
| `team.member_added` | Team member added |
| `team.member_removed` | Team member removed |
| `team.member_role_changed` | Member role updated |

### Security Events

| Event | Description |
|-------|-------------|
| `security.alert` | Security event detected |
| `security.audit_log` | Audit log entry created |

## Event Payload

All webhook events follow a consistent structure:

```json
{
  "id": "evt_1234567890",
  "type": "deployment.succeeded",
  "teamId": "team_abc123",
  "projectId": "proj_def456",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    // Event-specific data
  }
}
```

### Example: Deployment Succeeded

```json
{
  "id": "evt_1234567890",
  "type": "deployment.succeeded",
  "teamId": "team_abc123",
  "projectId": "proj_def456",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "deployment": {
      "id": "dep_789xyz",
      "status": "ready",
      "environment": "production",
      "duration": 45000,
      "createdAt": "2024-01-01T00:00:00Z",
      "completedAt": "2024-01-01T00:00:45Z"
    },
    "project": {
      "id": "proj_def456",
      "name": "My App",
      "slug": "my-app"
    },
    "team": {
      "id": "team_abc123",
      "name": "Acme Corp"
    }
  }
}
```

## Security

### Signature Verification

All webhook requests include an HMAC signature in the `X-Webhook-Signature` header. Always verify this signature to ensure requests are from Cygni:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(req) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const secret = process.env.CYGNI_WEBHOOK_SECRET;
  
  if (!signature || !timestamp || !secret) {
    return false;
  }
  
  // Extract algorithm and hash
  const [algorithm, hash] = signature.split('=');
  
  // Compute expected signature
  const payload = JSON.stringify(req.body);
  const expectedHash = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');
  
  // Compare signatures
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(expectedHash)
  );
}
```

### Headers

Every webhook request includes these headers:

- `X-Webhook-Id` - The webhook configuration ID
- `X-Webhook-Event` - The event type
- `X-Webhook-Signature` - HMAC signature for verification
- `X-Webhook-Timestamp` - ISO timestamp of the event
- `User-Agent` - Always `Cygni-Webhook/1.0`

## Delivery & Retries

### Delivery Rules

- Webhooks are delivered via HTTPS POST requests
- Request timeout: 30 seconds
- Success: Any 2xx status code
- Failure: Non-2xx status or timeout

### Retry Policy

Failed deliveries are retried with exponential backoff:

1. First retry: 1 minute
2. Second retry: 5 minutes
3. Third retry: 15 minutes

After 3 failed attempts, the delivery is marked as failed.

### Delivery Status

Check delivery status via the API:

```bash
curl https://api.cygni.dev/api/webhooks/deliveries?webhookId=whk_123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## API Reference

### Create Webhook

```bash
POST /api/webhooks
```

```json
{
  "url": "https://your-app.com/webhooks",
  "events": ["deployment.succeeded"],
  "description": "Production deployments",
  "enabled": true,
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

### List Webhooks

```bash
GET /api/webhooks
```

### Get Webhook

```bash
GET /api/webhooks/:webhookId
```

### Update Webhook

```bash
PUT /api/webhooks/:webhookId
```

```json
{
  "events": ["deployment.succeeded", "deployment.failed"],
  "enabled": false
}
```

### Delete Webhook

```bash
DELETE /api/webhooks/:webhookId
```

### Test Webhook

```bash
POST /api/webhooks/:webhookId/test
```

Sends a test event to verify your endpoint is working.

### List Deliveries

```bash
GET /api/webhooks/deliveries?webhookId=whk_123&status=failed
```

Query parameters:
- `webhookId` - Filter by webhook
- `status` - Filter by status (pending, success, failed)
- `eventType` - Filter by event type
- `startDate` - Filter by date range
- `endDate` - Filter by date range

### List Event Types

```bash
GET /api/webhooks/event-types
```

## Best Practices

1. **Always verify signatures** - Never process webhooks without verification
2. **Respond quickly** - Return 200 immediately, process asynchronously
3. **Handle duplicates** - Use event IDs to ensure idempotency
4. **Monitor failures** - Set up alerts for failed deliveries
5. **Use HTTPS** - Webhooks are only sent to HTTPS endpoints

## Examples

### Node.js/Express

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

app.post('/webhooks/cygni', async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    return res.status(401).send('Unauthorized');
  }
  
  const event = req.body;
  
  // Process event asynchronously
  setImmediate(async () => {
    try {
      await processWebhookEvent(event);
    } catch (error) {
      console.error('Webhook processing failed:', error);
    }
  });
  
  // Respond immediately
  res.status(200).send('OK');
});

async function processWebhookEvent(event) {
  switch (event.type) {
    case 'deployment.succeeded':
      await notifySlack(`Deployment succeeded for ${event.data.project.name}`);
      break;
      
    case 'billing.usage_limit_exceeded':
      await sendEmail('admin@company.com', 'Usage limit exceeded!', event.data);
      break;
  }
}
```

### Python/Flask

```python
from flask import Flask, request, abort
import hmac
import hashlib
import json

app = Flask(__name__)

@app.route('/webhooks/cygni', methods=['POST'])
def handle_webhook():
    # Verify signature
    if not verify_signature(request):
        abort(401)
    
    event = request.json
    
    # Process event
    if event['type'] == 'deployment.succeeded':
        print(f"Deployment succeeded: {event['data']}")
    elif event['type'] == 'alert.triggered':
        send_pagerduty_alert(event['data'])
    
    return 'OK', 200

def verify_signature(request):
    signature = request.headers.get('X-Webhook-Signature')
    secret = os.environ.get('CYGNI_WEBHOOK_SECRET')
    
    if not signature or not secret:
        return False
    
    algorithm, hash_value = signature.split('=')
    payload = request.get_data()
    
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(hash_value, expected)
```

## Troubleshooting

### Webhook not receiving events

1. Verify webhook is enabled
2. Check event subscriptions match
3. Ensure HTTPS endpoint is publicly accessible
4. Check delivery logs for errors

### Signature verification failing

1. Ensure you're using the raw request body
2. Don't modify the payload before verification
3. Check you're using the correct signing secret

### Deliveries failing

1. Return 2xx status code for success
2. Respond within 30 seconds
3. Check your server logs for errors
4. Use the test endpoint to debug