#!/bin/bash
# Deploy landing page to GitHub Pages or Netlify

set -e

echo " Deploying CloudExpress landing page..."

LANDING_DIR="/Users/patrickgloria/CloudExpress/packages/landing"
DEPLOY_BRANCH="gh-pages"

# Option 1: GitHub Pages deployment
deploy_github_pages() {
    echo "Deploying to GitHub Pages..."
    
    cd $LANDING_DIR
    
    # Create a temporary directory
    TEMP_DIR=$(mktemp -d)
    
    # Copy landing page files
    cp index.html $TEMP_DIR/
    
    # Initialize git in temp directory
    cd $TEMP_DIR
    git init
    git add .
    git commit -m "Deploy landing page $(date)"
    
    # Push to gh-pages branch
    git remote add origin git@github.com:cloudexpress/cloudexpress.github.io.git
    git push -f origin main:$DEPLOY_BRANCH
    
    # Cleanup
    rm -rf $TEMP_DIR
    
    echo " Deployed to https://cloudexpress.github.io"
}

# Option 2: Netlify deployment
deploy_netlify() {
    echo "Deploying to Netlify..."
    
    cd $LANDING_DIR
    
    # Install Netlify CLI if not present
    if ! command -v netlify &> /dev/null; then
        echo "Installing Netlify CLI..."
        npm install -g netlify-cli
    fi
    
    # Deploy to Netlify
    netlify deploy --prod --dir=. --site=cloudexpress-landing
    
    echo " Deployed to Netlify"
}

# Option 3: Simple S3 + CloudFront deployment
deploy_aws() {
    echo "Deploying to AWS S3 + CloudFront..."
    
    BUCKET_NAME="beta.cloudexpress.app"
    DISTRIBUTION_ID="E1234567890ABC"
    
    cd $LANDING_DIR
    
    # Upload to S3
    aws s3 sync . s3://$BUCKET_NAME/ \
        --exclude ".git/*" \
        --exclude "*.sh" \
        --cache-control "public, max-age=3600"
    
    # Invalidate CloudFront cache
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*"
    
    echo " Deployed to https://beta.cloudexpress.app"
}

# Quick local preview
preview_local() {
    echo "Starting local preview server..."
    cd $LANDING_DIR
    python3 -m http.server 8080
}

# Main deployment logic
case "${1:-github}" in
    "github")
        deploy_github_pages
        ;;
    "netlify")
        deploy_netlify
        ;;
    "aws")
        deploy_aws
        ;;
    "preview")
        preview_local
        ;;
    *)
        echo "Usage: $0 [github|netlify|aws|preview]"
        exit 1
        ;;
esac

echo ""
echo " Landing page deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Verify the deployment at the URL above"
echo "  2. Test the email signup flow"
echo "  3. Check analytics are working"
echo "  4. Share on social media!"