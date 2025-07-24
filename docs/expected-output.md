# Expected AWS Deployment Output

This is what users should see when running `cx deploy --aws --name demo-app`:

```
$ cx deploy --aws --name demo-app

🚀 Deploying demo-app to AWS

✓ AWS credentials found
✓ Detected node-20 application
✓ Dockerfile created
✓ Setting up container registry
  Authenticating with ECR
  Building container (this may take a moment)
  Step 1/7 : FROM node:20-alpine
  ----> a1b2c3d4e5f6
  Step 2/7 : WORKDIR /app
  ----> Running in 1234567890ab
  ----> cdef12345678
  Step 3/7 : COPY package*.json ./
  ----> 9876543210fe
  Step 4/7 : RUN npm ci --only=production
  ----> Running in abcdef123456
  ----> fedcba987654
  Step 5/7 : COPY . .
  ----> 321098765432
  Step 6/7 : EXPOSE 3000
  ----> Running in 567890abcdef
  ----> 109876543210
  Step 7/7 : CMD ["npm", "start"]
  ----> Running in 0987654321ab
  ----> abc123def456
  ✓ Successfully built abc123def456
  ✓ Successfully tagged 123456789012.dkr.ecr.us-east-1.amazonaws.com/cygni/demo-app:latest
  Pushing image to ECR
✓ Building application image
✓ Creating infrastructure
  CloudFormation: CREATE_IN_PROGRESS
  CloudFormation: CREATE_COMPLETE

✅ Deployment complete!

Your app is available at:
  https://demo-app.cx-demo.xyz

✨ Finished in 2m 47s

Useful commands:
  cx deploy --aws --name demo-app --rollback  # Rollback
  cx logs demo-app --aws                      # View logs
  cx status demo-app --aws                    # Check status
```

## Key Visual Elements

1. **Progress Indicators**
   - `✓` for completed steps
   - Spinner for in-progress operations
   - Indented sub-steps with descriptive text

2. **Docker Build Output**
   - Shows layer caching (important for speed)
   - Step numbers for progress tracking
   - Success messages for built/tagged images

3. **Infrastructure Status**
   - Real-time CloudFormation status updates
   - Transitions from CREATE_IN_PROGRESS to CREATE_COMPLETE

4. **Final Summary**
   - Bold green success message
   - Clickable HTTPS URL
   - Total time with emoji
   - Helpful next commands

## Rollback Output

```
$ cx deploy --aws --name demo-app --rollback

🚀 Rolling back demo-app...

✓ Getting current deployment info
✓ Rolling back to previous task definition

✅ Rollback complete!

✨ Reverted to previous version successfully
```

## Error Scenarios

### Missing AWS Credentials

```
🚀 Deploying demo-app to AWS

✗ AWS credentials not found

Please configure AWS credentials:
  aws configure

Or use environment variables:
  export AWS_ACCESS_KEY_ID=...
  export AWS_SECRET_ACCESS_KEY=...
```

### Docker Not Running

```
🚀 Deploying demo-app to AWS

✓ AWS credentials found
✓ Detected node-20 application
✗ Docker daemon not running

Start Docker Desktop or run:
  sudo systemctl start docker
```

### Unsupported Framework

```
🚀 Deploying demo-app to AWS

✓ AWS credentials found
✗ Unsupported application type

Supported frameworks for v0.1:
  • Express (Node.js)
  • Next.js
```
