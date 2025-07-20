#!/bin/bash
# Source this file before recording: source ./scripts/demo-env.sh

# Clean terminal prompt
export PS1="$ "

# Hide AWS account details
export AWS_ACCOUNT_ALIAS="demo-account"

# Set demo region
export AWS_DEFAULT_REGION="us-east-1"

# Demo configuration (replace with your values)
export CX_HOSTED_ZONE_ID="Z1234567890ABC"
export CX_CERTIFICATE_ARN="arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"

# Aliases for demo
alias cx="./cx"
alias ll="ls -la"

# Set terminal title
echo -ne "\033]0;Cygni Demo\007"

# Clear screen for clean start
clear

echo "🎬 Demo environment loaded!"
echo "   - Clean prompt: ✓"
echo "   - AWS config: ✓"
echo "   - Aliases set: ✓"
echo ""
echo "Ready to record!"