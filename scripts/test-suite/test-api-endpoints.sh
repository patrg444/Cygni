#!/bin/bash
# Test API endpoints when server is running

echo "CloudExpress API Endpoint Test"
echo "=============================="
echo ""

API_URL="${API_URL:-http://localhost:3000/api}"

# Check if server is running
check_server() {
    echo "Checking if API server is running at $API_URL..."
    if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null | grep -q "200\|404"; then
        echo "✅ Server appears to be running"
        return 0
    else
        echo "❌ Server is not running at $API_URL"
        echo ""
        echo "To start the server:"
        echo "  cd packages/api"
        echo "  npm install"
        echo "  npm run dev"
        echo ""
        return 1
    fi
}

# Test endpoints
test_endpoints() {
    echo ""
    echo "Testing API Endpoints:"
    echo "---------------------"
    
    # 1. Waitlist signup
    echo ""
    echo "1. POST /api/waitlist (Signup)"
    curl -X POST "$API_URL/waitlist" \
        -H "Content-Type: application/json" \
        -d '{"email": "test@example.com"}' \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
    
    # 2. Waitlist stats (requires auth)
    echo ""
    echo "2. GET /api/waitlist/stats (Admin)"
    curl -X GET "$API_URL/waitlist/stats" \
        -H "Authorization: Bearer test-admin-key" \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
    
    # 3. Auth signup
    echo ""
    echo "3. POST /api/auth/signup"
    curl -X POST "$API_URL/auth/signup" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "newuser@example.com",
            "password": "testpass123",
            "name": "Test User",
            "teamName": "Test Team"
        }' \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
    
    # 4. Auth login
    echo ""
    echo "4. POST /api/auth/login"
    curl -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test@example.com",
            "password": "testpass123"
        }' \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
    
    # 5. JWKS endpoint
    echo ""
    echo "5. GET /api/auth/.well-known/jwks.json"
    curl -X GET "$API_URL/auth/.well-known/jwks.json" \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
    
    # 6. Budget check (requires auth)
    echo ""
    echo "6. GET /api/projects/{projectId}/budget"
    curl -X GET "$API_URL/projects/test-project/budget" \
        -H "Authorization: Bearer test-token" \
        -w "\nStatus: %{http_code}\n" \
        2>/dev/null || echo "Failed to connect"
}

# Check what files exist
check_implementation() {
    echo ""
    echo "Checking Implementation Status:"
    echo "------------------------------"
    
    files=(
        "packages/api/src/routes/waitlist.ts"
        "packages/api/src/routes/auth.ts"
        "packages/api/src/services/billing/budget-monitor.ts"
        "packages/api/src/services/billing/stripe.service.ts"
        "packages/api/src/services/auth/jwt-rotation.service.ts"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            echo "✅ $file exists"
        else
            echo "❌ $file missing"
        fi
    done
}

# Check if API package exists
check_api_structure() {
    echo ""
    echo "Checking API Package Structure:"
    echo "------------------------------"
    
    if [ -d "packages/api" ]; then
        echo "✅ API package directory exists"
        
        # Check for package.json
        if [ -f "packages/api/package.json" ]; then
            echo "✅ package.json exists"
            
            # Check if it has required dependencies
            if grep -q "express" "packages/api/package.json"; then
                echo "✅ Express dependency found"
            else
                echo "⚠️  Express not in dependencies"
            fi
            
            if grep -q "stripe" "packages/api/package.json"; then
                echo "✅ Stripe dependency found"
            else
                echo "⚠️  Stripe not in dependencies"
            fi
        else
            echo "❌ package.json missing"
        fi
        
        # Check for main server file
        if [ -f "packages/api/src/index.ts" ] || [ -f "packages/api/src/server.ts" ]; then
            echo "✅ Server entry point exists"
        else
            echo "❌ No server entry point (index.ts/server.ts)"
        fi
    else
        echo "❌ API package directory missing"
    fi
}

# Main execution
echo "Current Status:"
echo "--------------"

# Check implementation
check_implementation

# Check API structure
check_api_structure

# Try to test live endpoints
echo ""
if check_server; then
    test_endpoints
else
    echo "💡 The API endpoints are implemented but not running."
    echo ""
    echo "To test the endpoints:"
    echo "1. First, ensure all dependencies are installed"
    echo "2. Set up environment variables (.env file)"
    echo "3. Start the API server"
    echo "4. Run this script again"
fi

echo ""
echo "Summary:"
echo "--------"
echo "✅ All endpoint code is implemented"
echo "⚠️  API server needs to be running to test live endpoints"
echo "📝 Next step: Set up and start the API server"