#!/bin/bash
# Comprehensive test suite for CloudExpress launch readiness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
WARNINGS=0

# Log functions
log_test() {
    echo -e "\n${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

# Test landing page
test_landing_page() {
    log_test "Testing landing page functionality"
    
    # Check if landing page exists
    if [ -f "/Users/patrickgloria/CloudExpress/packages/landing/index.html" ]; then
        log_pass "Landing page exists"
    else
        log_fail "Landing page not found"
        return 1
    fi
    
    # Validate HTML
    if command -v tidy &> /dev/null; then
        if tidy -q -e /Users/patrickgloria/CloudExpress/packages/landing/index.html 2>/dev/null; then
            log_pass "HTML validation passed"
        else
            log_warn "HTML has validation warnings"
        fi
    else
        log_warn "HTML validator (tidy) not installed, skipping validation"
    fi
    
    # Check for analytics tags
    if grep -q "plausible.io" /Users/patrickgloria/CloudExpress/packages/landing/index.html; then
        log_pass "Plausible analytics found"
    else
        log_fail "Plausible analytics missing"
    fi
    
    if grep -q "googletagmanager.com" /Users/patrickgloria/CloudExpress/packages/landing/index.html; then
        log_pass "Google Analytics found"
    else
        log_fail "Google Analytics missing"
    fi
    
    # Check for waitlist form
    if grep -q "early-access" /Users/patrickgloria/CloudExpress/packages/landing/index.html; then
        log_pass "Waitlist form present"
    else
        log_fail "Waitlist form missing"
    fi
}

# Test chaos testing scripts
test_chaos_scripts() {
    log_test "Testing chaos testing scripts"
    
    CHAOS_SCRIPT="/Users/patrickgloria/CloudExpress/scripts/chaos-testing/failure-friday.sh"
    
    if [ -f "$CHAOS_SCRIPT" ]; then
        log_pass "Failure Friday script exists"
        
        # Check if executable
        if [ -x "$CHAOS_SCRIPT" ]; then
            log_pass "Script is executable"
        else
            log_fail "Script is not executable"
        fi
        
        # Check for required functions
        for func in "inject_failure" "monitor_rollback" "verify_alerts" "cleanup"; do
            if grep -q "$func()" "$CHAOS_SCRIPT"; then
                log_pass "Function $func found"
            else
                log_fail "Function $func missing"
            fi
        done
    else
        log_fail "Failure Friday script not found"
    fi
}

# Test budget monitoring
test_budget_monitor() {
    log_test "Testing budget monitoring system"
    
    BUDGET_FILE="/Users/patrickgloria/CloudExpress/packages/api/src/services/billing/budget-monitor.ts"
    
    if [ -f "$BUDGET_FILE" ]; then
        log_pass "Budget monitor service exists"
        
        # Check for key methods
        for method in "checkBudget" "calculateCurrentUsage" "enforceFreeTierLimit" "sendBudgetAlert"; do
            if grep -q "$method" "$BUDGET_FILE"; then
                log_pass "Method $method implemented"
            else
                log_fail "Method $method missing"
            fi
        done
        
        # Check free tier limit
        if grep -q "FREE_TIER_LIMIT = 10.00" "$BUDGET_FILE"; then
            log_pass "Free tier limit set to $10"
        else
            log_fail "Free tier limit not properly set"
        fi
    else
        log_fail "Budget monitor service not found"
    fi
}

# Test Stripe integration
test_stripe_integration() {
    log_test "Testing Stripe integration"
    
    STRIPE_FILE="/Users/patrickgloria/CloudExpress/packages/api/src/services/billing/stripe.service.ts"
    
    if [ -f "$STRIPE_FILE" ]; then
        log_pass "Stripe service exists"
        
        # Check for webhook handler
        if grep -q "handleWebhook" "$STRIPE_FILE"; then
            log_pass "Webhook handler implemented"
        else
            log_fail "Webhook handler missing"
        fi
        
        # Check for usage reporting
        if grep -q "reportUsage" "$STRIPE_FILE"; then
            log_pass "Usage reporting implemented"
        else
            log_fail "Usage reporting missing"
        fi
        
        # Check for payment failure handling
        if grep -q "handlePaymentFailure" "$STRIPE_FILE"; then
            log_pass "Payment failure handling implemented"
        else
            log_fail "Payment failure handling missing"
        fi
    else
        log_fail "Stripe service not found"
    fi
}

# Test JWT rotation
test_jwt_rotation() {
    log_test "Testing JWT rotation mechanism"
    
    JWT_FILE="/Users/patrickgloria/CloudExpress/packages/api/src/services/auth/jwt-rotation.service.ts"
    
    if [ -f "$JWT_FILE" ]; then
        log_pass "JWT rotation service exists"
        
        # Check rotation interval
        if grep -q "KEY_ROTATION_HOURS = 24" "$JWT_FILE"; then
            log_pass "24-hour rotation configured"
        else
            log_fail "Rotation interval not properly set"
        fi
        
        # Check key retention
        if grep -q "KEY_RETENTION_DAYS = 3" "$JWT_FILE"; then
            log_pass "3-day retention configured"
        else
            log_fail "Key retention not properly set"
        fi
        
        # Check JWKS endpoint
        if grep -q "getJWKS" "$JWT_FILE"; then
            log_pass "JWKS endpoint implemented"
        else
            log_fail "JWKS endpoint missing"
        fi
    else
        log_fail "JWT rotation service not found"
    fi
}

# Test email templates
test_email_templates() {
    log_test "Testing email drip campaign"
    
    EMAIL_FILE="/Users/patrickgloria/CloudExpress/packages/api/src/templates/emails/drip-campaign.ts"
    
    if [ -f "$EMAIL_FILE" ]; then
        log_pass "Email templates exist"
        
        # Check for all 4 emails
        for email in "welcome" "peakFeature" "caseStudy" "deployNow"; do
            if grep -q "\"$email\":" "$EMAIL_FILE"; then
                log_pass "Email template '$email' found"
            else
                log_fail "Email template '$email' missing"
            fi
        done
    else
        log_fail "Email templates not found"
    fi
}

# Test API endpoints
test_api_endpoints() {
    log_test "Testing API endpoint structure"
    
    # Check waitlist endpoint
    if [ -f "/Users/patrickgloria/CloudExpress/packages/api/src/routes/waitlist.ts" ]; then
        log_pass "Waitlist API exists"
        
        if grep -q "POST.*waitlist" "/Users/patrickgloria/CloudExpress/packages/api/src/routes/waitlist.ts"; then
            log_pass "Waitlist signup endpoint found"
        else
            log_fail "Waitlist signup endpoint missing"
        fi
    else
        log_fail "Waitlist API not found"
    fi
    
    # Check auth endpoints
    if [ -f "/Users/patrickgloria/CloudExpress/packages/api/src/routes/auth.ts" ]; then
        log_pass "Auth API exists"
        
        for endpoint in "signup" "login" "jwks.json" "refresh"; do
            if grep -q "$endpoint" "/Users/patrickgloria/CloudExpress/packages/api/src/routes/auth.ts"; then
                log_pass "Auth endpoint '$endpoint' found"
            else
                log_fail "Auth endpoint '$endpoint' missing"
            fi
        done
    else
        log_fail "Auth API not found"
    fi
}

# Test deployment scripts
test_deployment_scripts() {
    log_test "Testing deployment scripts"
    
    DEPLOY_SCRIPT="/Users/patrickgloria/CloudExpress/scripts/deploy-landing.sh"
    
    if [ -f "$DEPLOY_SCRIPT" ]; then
        log_pass "Landing deployment script exists"
        
        if [ -x "$DEPLOY_SCRIPT" ]; then
            log_pass "Deployment script is executable"
        else
            log_fail "Deployment script is not executable"
        fi
        
        # Check deployment options
        for option in "github" "netlify" "aws"; do
            if grep -q "deploy_$option" "$DEPLOY_SCRIPT"; then
                log_pass "Deployment option '$option' available"
            else
                log_fail "Deployment option '$option' missing"
            fi
        done
    else
        log_fail "Landing deployment script not found"
    fi
}

# Test UI components
test_ui_components() {
    log_test "Testing UI components"
    
    # Check monitoring dashboard
    if [ -f "/Users/patrickgloria/CloudExpress/packages/web-ui/src/components/MonitoringDashboard.tsx" ]; then
        log_pass "Monitoring dashboard component exists"
    else
        log_fail "Monitoring dashboard component missing"
    fi
    
    # Check deployment strategy view
    if [ -f "/Users/patrickgloria/CloudExpress/packages/web-ui/src/components/DeploymentStrategyView.tsx" ]; then
        log_pass "Deployment strategy view exists"
    else
        log_fail "Deployment strategy view missing"
    fi
    
    # Check enhanced deployments page
    DEPLOY_PAGE="/Users/patrickgloria/CloudExpress/packages/web-ui/src/app/deployments/page.tsx"
    if [ -f "$DEPLOY_PAGE" ]; then
        # Check for filters
        if grep -q "filters" "$DEPLOY_PAGE"; then
            log_pass "Deployment filters implemented"
        else
            log_fail "Deployment filters missing"
        fi
        
        # Check for canary progress
        if grep -q "canaryStatus" "$DEPLOY_PAGE"; then
            log_pass "Canary progress visualization implemented"
        else
            log_fail "Canary progress visualization missing"
        fi
        
        # Check for health gate status
        if grep -q "healthGate" "$DEPLOY_PAGE"; then
            log_pass "Health gate status display implemented"
        else
            log_fail "Health gate status display missing"
        fi
    else
        log_fail "Deployments page not found"
    fi
}

# Test Kubernetes resources
test_kubernetes_resources() {
    log_test "Testing Kubernetes resources"
    
    # Check CRDs
    for crd in "cloudexpressservice_types.go" "multiregion_types.go"; do
        if [ -f "/Users/patrickgloria/CloudExpress/services/runtime-orchestrator/api/v1/$crd" ]; then
            log_pass "CRD $crd exists"
        else
            log_fail "CRD $crd missing"
        fi
    done
    
    # Check controllers
    for controller in "cloudexpressservice_controller.go" "health_monitor.go" "canary_controller.go" "migration_runner.go" "multiregion_controller.go"; do
        if [ -f "/Users/patrickgloria/CloudExpress/services/runtime-orchestrator/controllers/$controller" ]; then
            log_pass "Controller $controller exists"
        else
            log_fail "Controller $controller missing"
        fi
    done
}

# Security checklist
test_security() {
    log_test "Security checklist"
    
    # Check for hardcoded secrets
    log_test "Scanning for hardcoded secrets..."
    
    # Common patterns to check
    patterns=(
        "password.*=.*['\"].*['\"]"
        "secret.*=.*['\"].*['\"]"
        "api_key.*=.*['\"].*['\"]"
        "private_key.*=.*['\"].*['\"]"
    )
    
    for pattern in "${patterns[@]}"; do
        if grep -r -i "$pattern" /Users/patrickgloria/CloudExpress --include="*.ts" --include="*.js" --exclude-dir=node_modules 2>/dev/null | grep -v "example" | grep -v "test" | grep -v "mock"; then
            log_fail "Potential hardcoded secret found (pattern: $pattern)"
        else
            log_pass "No hardcoded secrets for pattern: $pattern"
        fi
    done
    
    # Check JWT security
    if grep -q "algorithms:.*RS256" /Users/patrickgloria/CloudExpress/packages/api/src/services/auth/jwt-rotation.service.ts; then
        log_pass "JWT using secure RS256 algorithm"
    else
        log_fail "JWT not using RS256 algorithm"
    fi
}

# Run integration test
test_integration() {
    log_test "Integration test scenarios"
    
    # This would normally run actual integration tests
    # For now, we'll check that test infrastructure exists
    
    log_warn "Integration tests need to be run in a live environment"
    
    # Check for test data
    if [ -d "/Users/patrickgloria/CloudExpress/tests" ]; then
        log_pass "Test directory exists"
    else
        log_warn "Test directory not found - create /tests for integration tests"
    fi
}

# Main test execution
main() {
    echo "======================================"
    echo "CloudExpress Launch Readiness Test"
    echo "======================================"
    
    # Run all tests
    test_landing_page
    test_chaos_scripts
    test_budget_monitor
    test_stripe_integration
    test_jwt_rotation
    test_email_templates
    test_api_endpoints
    test_deployment_scripts
    test_ui_components
    test_kubernetes_resources
    test_security
    test_integration
    
    # Summary
    echo ""
    echo "======================================"
    echo "Test Summary"
    echo "======================================"
    echo -e "${GREEN}Passed:${NC} $PASSED"
    echo -e "${RED}Failed:${NC} $FAILED"
    echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN} All critical tests passed!${NC}"
        echo "CloudExpress is ready for launch prep."
    else
        echo -e "${RED} Some tests failed.${NC}"
        echo "Please fix the issues before proceeding."
        exit 1
    fi
    
    echo ""
    echo "Next steps:"
    echo "1. Deploy landing page: ./scripts/deploy-landing.sh"
    echo "2. Run chaos test in staging: ./scripts/chaos-testing/failure-friday.sh"
    echo "3. Configure Stripe webhook endpoint"
    echo "4. Set up monitoring dashboards"
    echo "5. Prepare social media announcements"
}

# Run tests
main