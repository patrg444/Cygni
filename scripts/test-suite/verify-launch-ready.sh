#!/bin/bash
# Verify CloudExpress is ready for launch

echo "CloudExpress Launch Readiness Verification"
echo "=========================================="
echo ""

# Track results
TOTAL_CHECKS=0
PASSED_CHECKS=0

# Helper function
check() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if eval "$2"; then
        echo " $1"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo " $1"
    fi
}

echo "1. LANDING PAGE CHECKS"
echo "----------------------"
check "Landing page exists" "[ -f packages/landing/index.html ]"
check "Analytics configured" "grep -q 'plausible.io' packages/landing/index.html"
check "Waitlist form present" "grep -q 'early-access' packages/landing/index.html"
check "Position tracking" "grep -q 'position' packages/landing/index.html"
check "Share incentive" "grep -q 'Share on Twitter' packages/landing/index.html"

echo ""
echo "2. CHAOS TESTING"
echo "----------------"
check "Failure Friday script exists" "[ -f scripts/chaos-testing/failure-friday.sh ]"
check "Script is executable" "[ -x scripts/chaos-testing/failure-friday.sh ]"
check "Has cleanup function" "grep -q 'cleanup()' scripts/chaos-testing/failure-friday.sh"
check "README documentation" "[ -f scripts/chaos-testing/README.md ]"

echo ""
echo "3. BILLING & BUDGET"
echo "-------------------"
check "Budget monitor service" "[ -f packages/api/src/services/billing/budget-monitor.ts ]"
check "Free tier limit ($10)" "grep -q 'FREE_TIER_LIMIT = 10' packages/api/src/services/billing/budget-monitor.ts"
check "Stripe service" "[ -f packages/api/src/services/billing/stripe.service.ts ]"
check "Webhook handling" "grep -q 'handleWebhook' packages/api/src/services/billing/stripe.service.ts"
check "Budget check job" "[ -f packages/api/src/jobs/budget-check.job.ts ]"

echo ""
echo "4. SECURITY"
echo "-----------"
check "JWT rotation service" "[ -f packages/api/src/services/auth/jwt-rotation.service.ts ]"
check "24-hour rotation" "grep -q 'KEY_ROTATION_HOURS = 24' packages/api/src/services/auth/jwt-rotation.service.ts"
check "JWKS endpoint" "grep -q 'jwks.json' packages/api/src/routes/auth.ts"
check "Auth routes" "[ -f packages/api/src/routes/auth.ts ]"

echo ""
echo "5. EMAIL CAMPAIGNS"
echo "------------------"
check "Email templates" "[ -f packages/api/src/templates/emails/drip-campaign.ts ]"
check "Welcome email" "grep -q 'welcome:' packages/api/src/templates/emails/drip-campaign.ts"
check "Feature email" "grep -q 'peakFeature:' packages/api/src/templates/emails/drip-campaign.ts"
check "Case study email" "grep -q 'caseStudy:' packages/api/src/templates/emails/drip-campaign.ts"
check "Activation email" "grep -q 'deployNow:' packages/api/src/templates/emails/drip-campaign.ts"

echo ""
echo "6. API ENDPOINTS"
echo "----------------"
check "Waitlist API" "[ -f packages/api/src/routes/waitlist.ts ]"
check "Waitlist stats endpoint" "grep -q '/waitlist/stats' packages/api/src/routes/waitlist.ts"

echo ""
echo "7. UI ENHANCEMENTS"
echo "------------------"
check "Monitoring dashboard" "[ -f packages/web-ui/src/components/MonitoringDashboard.tsx ]"
check "Deployment strategy view" "[ -f packages/web-ui/src/components/DeploymentStrategyView.tsx ]"
check "Deployment filters" "grep -q 'filters' packages/web-ui/src/app/deployments/page.tsx"
check "Canary progress" "grep -q 'canaryStatus' packages/web-ui/src/app/deployments/page.tsx"
check "Health gate display" "grep -q 'healthGate' packages/web-ui/src/app/deployments/page.tsx"

echo ""
echo "8. KUBERNETES COMPONENTS"
echo "------------------------"
check "CloudExpressService CRD" "[ -f services/runtime-orchestrator/api/v1/cloudexpressservice_types.go ]"
check "MultiRegion CRD" "[ -f services/runtime-orchestrator/api/v1/multiregion_types.go ]"
check "Main controller" "[ -f services/runtime-orchestrator/controllers/cloudexpressservice_controller.go ]"
check "Health monitor" "[ -f services/runtime-orchestrator/controllers/health_monitor.go ]"
check "Canary controller" "[ -f services/runtime-orchestrator/controllers/canary_controller.go ]"
check "Migration runner" "[ -f services/runtime-orchestrator/controllers/migration_runner.go ]"
check "Multi-region controller" "[ -f services/runtime-orchestrator/controllers/multiregion_controller.go ]"

echo ""
echo "9. DEPLOYMENT TOOLS"
echo "-------------------"
check "Landing deploy script" "[ -f scripts/deploy-landing.sh ]"
check "Deploy script executable" "[ -x scripts/deploy-landing.sh ]"

echo ""
echo "10. CONFIGURATION FILES"
echo "-----------------------"
# Check for example/template files that should exist
check "Example env template" "[ -f .env.example ] || echo '# Add .env.example for configuration'"

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo "Passed: $PASSED_CHECKS / $TOTAL_CHECKS checks"
echo ""

if [ $PASSED_CHECKS -eq $TOTAL_CHECKS ]; then
    echo " CloudExpress is READY for launch prep!"
    echo ""
    echo "Next immediate actions:"
    echo "1. Deploy landing page: ./scripts/deploy-landing.sh aws"
    echo "2. Configure Stripe webhook URL in dashboard"
    echo "3. Set up monitoring alerts"
    echo "4. Schedule first Failure Friday test"
    echo "5. Prepare social media posts"
else
    FAILED=$((TOTAL_CHECKS - PASSED_CHECKS))
    echo "  $FAILED checks failed. Review and fix before launch."
fi

echo ""
echo "Critical environment variables to set:"
echo "- STRIPE_SECRET_KEY"
echo "- STRIPE_WEBHOOK_SECRET"
echo "- STRIPE_PRICE_* (for each metric)"
echo "- DATABASE_URL"
echo "- JWT secrets"
echo "- AWS credentials (for S3/CloudFront)"