#!/bin/bash
# Integration test scenarios for CloudExpress

echo "CloudExpress Integration Test Scenarios"
echo "======================================"
echo ""

# Scenario 1: Waitlist signup flow
echo "SCENARIO 1: Waitlist Signup Flow"
echo "---------------------------------"
echo "1. User visits landing page"
echo "2. Enters email: test@example.com"
echo "3. System should:"
echo "   - Add to waitlist with position number"
echo "   - Send welcome email with position"
echo "   - Track in analytics"
echo "   - Show Twitter share option"
echo ""

# Scenario 2: Budget enforcement
echo "SCENARIO 2: Budget Limit Enforcement"
echo "------------------------------------"
echo "1. Project approaches $10 free tier limit"
echo "2. At 80% ($8), system sends warning email"
echo "3. At 100% ($10):"
echo "   - Scale non-production to 0"
echo "   - Scale production to minimum"
echo "   - Send critical alert"
echo "   - Update project status"
echo ""

# Scenario 3: Health gate failure
echo "SCENARIO 3: Deployment Health Gate Failure"
echo "------------------------------------------"
echo "1. Deploy new version with bug"
echo "2. Error rate spikes above 5%"
echo "3. Health monitor detects failure"
echo "4. Automatic rollback triggers"
echo "5. Alerts sent to team"
echo "6. Previous version restored"
echo ""

# Scenario 4: Canary deployment
echo "SCENARIO 4: Canary Deployment Flow"
echo "----------------------------------"
echo "1. Deploy with --strategy canary"
echo "2. Traffic shifts: 10% → 25% → 50% → 75% → 100%"
echo "3. Monitor health at each stage"
echo "4. Auto-promote if healthy"
echo "5. Rollback if unhealthy"
echo ""

# Scenario 5: JWT rotation
echo "SCENARIO 5: JWT Key Rotation"
echo "----------------------------"
echo "1. Every 24 hours, new key generated"
echo "2. Old keys retained for 3 days"
echo "3. JWKS endpoint updated"
echo "4. Existing tokens remain valid"
echo "5. New tokens use new key"
echo ""

# Scenario 6: Payment failure
echo "SCENARIO 6: Stripe Payment Failure"
echo "----------------------------------"
echo "1. Card payment fails"
echo "2. 24-hour grace period starts"
echo "3. Email sent with update link"
echo "4. If not resolved:"
echo "   - Projects suspended"
echo "   - Team notified"
echo "5. After payment update:"
echo "   - Projects restored"
echo ""

# Test data for manual testing
echo ""
echo "TEST DATA FOR MANUAL VERIFICATION"
echo "================================="
echo ""
echo "1. Test Waitlist Signup:"
echo "   curl -X POST http://localhost:3000/api/waitlist \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\": \"test@example.com\"}'"
echo ""
echo "2. Test Budget Check:"
echo "   curl http://localhost:3000/api/projects/{projectId}/budget"
echo ""
echo "3. Test Health Gate:"
echo "   kubectl patch cloudexpressservice demo \\"
echo "     --type='json' -p='[{\"op\": \"replace\", \"path\": \"/spec/healthGate/maxErrorRate\", \"value\": 0.01}]'"
echo ""
echo "4. Test JWKS Endpoint:"
echo "   curl http://localhost:3000/api/auth/.well-known/jwks.json"
echo ""

# Create mock data generator
cat > /Users/patrickgloria/CloudExpress/scripts/test-suite/generate-test-data.js << 'EOF'
// Generate test data for CloudExpress

const testData = {
  // Waitlist entries
  waitlistUsers: [
    { email: 'alice@startup.com', source: 'twitter' },
    { email: 'bob@tech.io', source: 'hackernews' },
    { email: 'carol@dev.com', source: 'landing' },
  ],

  // Usage events for budget testing
  usageEvents: [
    { metricType: 'cpu_seconds', quantity: 3600000 }, // 1000 CPU hours
    { metricType: 'memory_gb_hours', quantity: 1000 },
    { metricType: 'egress_gb', quantity: 50 },
    { metricType: 'requests', quantity: 10000000 }, // 10M requests
  ],

  // Deployment scenarios
  deployments: [
    { 
      name: 'healthy-deploy',
      errorRate: 0.5,
      p95Latency: 150,
      successRate: 99.5 
    },
    { 
      name: 'failing-deploy',
      errorRate: 7.2,
      p95Latency: 850,
      successRate: 92.8 
    },
  ],
};

console.log('Test data generated:', JSON.stringify(testData, null, 2));
EOF

echo ""
echo "VERIFICATION CHECKLIST"
echo "====================="
echo "□ Landing page loads without errors"
echo "□ Waitlist signup works and returns position"
echo "□ Email is sent (check logs/inbox)"
echo "□ Analytics events fire (check Plausible/GA)"
echo "□ Budget monitoring calculates correctly"
echo "□ Health gates trigger on bad metrics"
echo "□ JWT rotation happens on schedule"
echo "□ Stripe webhooks are received"
echo "□ UI shows filters and progress bars"
echo "□ Chaos script runs without errors"
echo ""
echo "Run 'node scripts/test-suite/generate-test-data.js' for test data"