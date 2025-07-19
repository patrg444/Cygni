#!/bin/bash

# GitHub repository setup script for Cygni
# Run this with: bash scripts/setup-github.sh

echo "Setting up GitHub repository for Cygni..."

# Update repository metadata
echo "Updating repository description..."
gh repo edit patrg444/Cygni \
  --description "Developer-first cloud platform - Deploy full-stack apps with one command" \
  --homepage "https://cygni.dev" \
  --topics "cloud,platform,paas,kubernetes,developer-tools,deployment,cicd,docker"

# Create useful labels
echo "Creating issue labels..."
gh label create "priority:critical" --color "FF0000" --description "Critical priority issue"
gh label create "priority:high" --color "FF6B6B" --description "High priority issue"
gh label create "priority:medium" --color "FFB84D" --description "Medium priority issue"
gh label create "priority:low" --color "99D98C" --description "Low priority issue"

gh label create "type:feature" --color "0052CC" --description "New feature request"
gh label create "type:bug" --color "D73A4A" --description "Something isn't working"
gh label create "type:security" --color "FF0000" --description "Security vulnerability"
gh label create "type:performance" --color "FBCA04" --description "Performance improvement"
gh label create "type:docs" --color "0075CA" --description "Documentation improvements"

gh label create "service:api" --color "7057FF" --description "API service"
gh label create "service:auth" --color "7057FF" --description "Auth service"
gh label create "service:builder" --color "7057FF" --description "Builder service"
gh label create "service:orchestrator" --color "7057FF" --description "Runtime orchestrator"

gh label create "dependencies" --color "0366D6" --description "Dependency updates"
gh label create "automated" --color "795548" --description "Automated PR/issue"

# Set up branch protection for main
echo "Setting up branch protection..."
gh api repos/patrg444/Cygni/branches/main/protection -X PUT \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=lint" \
  -f "required_status_checks[contexts][]=test-matrix" \
  -f "required_status_checks[contexts][]=security" \
  -f "enforce_admins=false" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -f "required_pull_request_reviews[require_code_owner_reviews]=true" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f "allow_force_pushes=false" \
  -f "allow_deletions=false"

# Create GitHub Actions secrets placeholders
echo "Creating secret placeholders (you'll need to update these with real values)..."
echo "Run these commands with your actual secret values:"
echo ""
echo "# Stripe"
echo "gh secret set STRIPE_SECRET_KEY"
echo "gh secret set STRIPE_WEBHOOK_SECRET"
echo ""
echo "# Database"
echo "gh secret set DATABASE_URL"
echo ""
echo "# Auth"
echo "gh secret set JWT_PRIVATE_KEY"
echo ""
echo "# AWS (for ECR)"
echo "gh secret set AWS_ACCESS_KEY_ID"
echo "gh secret set AWS_SECRET_ACCESS_KEY"
echo ""
echo "# Docker Hub"
echo "gh secret set DOCKERHUB_USERNAME"
echo "gh secret set DOCKERHUB_TOKEN"
echo ""
echo "# Monitoring"
echo "gh secret set CODECOV_TOKEN"
echo "gh secret set CODSPEED_TOKEN"
echo "gh secret set FOSSA_API_KEY"

# Create initial milestones
echo "Creating milestones..."
gh api repos/patrg444/Cygni/milestones -X POST \
  -H "Accept: application/vnd.github+json" \
  -f "title=v0.1.0 - Beta Launch" \
  -f "description=Initial beta release with core functionality" \
  -f "due_on=$(date -u -d '+30 days' '+%Y-%m-%dT%H:%M:%SZ')"

gh api repos/patrg444/Cygni/milestones -X POST \
  -H "Accept: application/vnd.github+json" \
  -f "title=v0.2.0 - GA Ready" \
  -f "description=Production-ready release" \
  -f "due_on=$(date -u -d '+60 days' '+%Y-%m-%dT%H:%M:%SZ')"

# Create initial issues
echo "Creating initial tracking issues..."

gh issue create \
  --title "Set up production infrastructure" \
  --body "Deploy Cygni to production Kubernetes cluster
  
- [ ] Set up production Kubernetes cluster
- [ ] Configure cert-manager for SSL
- [ ] Deploy observability stack (Prometheus/Grafana/Loki)
- [ ] Set up ingress controller
- [ ] Configure external-dns
- [ ] Deploy Cygni services" \
  --label "priority:high,type:feature" \
  --milestone "v0.1.0 - Beta Launch"

gh issue create \
  --title "Complete frontend dashboard implementation" \
  --body "Implement the Cygni dashboard based on Figma designs
  
- [ ] Projects list view
- [ ] Deployment detail page
- [ ] Real-time logs viewer
- [ ] Settings pages
- [ ] Billing/usage dashboard" \
  --label "priority:high,type:feature" \
  --milestone "v0.1.0 - Beta Launch"

gh issue create \
  --title "Implement CLI commands" \
  --body "Complete the Cygni CLI implementation
  
- [ ] cygni init
- [ ] cygni deploy
- [ ] cygni logs
- [ ] cygni rollback
- [ ] cygni secrets" \
  --label "priority:high,type:feature,service:cli" \
  --milestone "v0.1.0 - Beta Launch"

gh issue create \
  --title "Set up landing page" \
  --body "Deploy the marketing landing page
  
- [ ] Implement landing page based on design
- [ ] Set up waitlist API integration
- [ ] Deploy to cygni.dev
- [ ] Configure analytics
- [ ] Set up A/B testing" \
  --label "priority:medium,type:feature" \
  --milestone "v0.1.0 - Beta Launch"

echo "GitHub repository setup complete!"
echo ""
echo "Next steps:"
echo "1. Update the GitHub Actions secrets with real values"
echo "2. Enable GitHub Actions in the repository settings"
echo "3. Configure webhooks for deployments"
echo "4. Set up GitHub Pages for documentation (optional)"