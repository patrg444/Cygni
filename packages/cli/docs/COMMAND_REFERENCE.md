# Cygni CLI Command Reference

Complete reference for all Cygni CLI commands.

## Global Options

These options can be used with any command:

- `--help, -h` - Show help for a command
- `--version, -v` - Show CLI version
- `--debug` - Enable debug logging
- `--json` - Output in JSON format
- `--no-color` - Disable colored output

## Authentication Commands

### `cygni login`

Authenticate with your Cygni account.

```bash
cygni login
# Opens browser for authentication

cygni login --token YOUR_TOKEN
# Login with API token
```

### `cygni logout`

Log out of your Cygni account.

```bash
cygni logout
```

### `cygni whoami`

Display current user information.

```bash
cygni whoami
```

### `cygni signup`

Create a new Cygni account.

```bash
cygni signup
```

## Deployment Commands

### `cygni deploy`

Deploy your application.

```bash
cygni deploy
# Deploy current directory

cygni deploy --prod
# Deploy to production

cygni deploy --git https://github.com/user/repo
# Deploy from Git repository

cygni deploy --branch staging
# Deploy specific branch

cygni deploy --no-cache
# Force rebuild without cache
```

Options:

- `--prod` - Deploy to production environment
- `--git URL` - Deploy from Git repository
- `--branch NAME` - Deploy specific branch
- `--no-cache` - Disable build cache
- `--env ENV` - Target environment (production, preview, development)

### `cygni redeploy`

Redeploy the latest deployment.

```bash
cygni redeploy
cygni redeploy --deployment-id dep_123
```

### `cygni rollback`

Rollback to a previous deployment.

```bash
cygni rollback
# Rollback to previous deployment

cygni rollback --deployment-id dep_123
# Rollback to specific deployment
```

## Project Management

### `cygni projects list`

List all projects.

```bash
cygni projects list
cygni projects list --team team-id
```

### `cygni projects create`

Create a new project.

```bash
cygni projects create my-app
cygni projects create my-app --framework nextjs
```

### `cygni projects delete`

Delete a project.

```bash
cygni projects delete my-app
cygni projects delete --project-id proj_123
```

### `cygni status`

Show project deployment status.

```bash
cygni status
cygni status --project my-app
```

## Environment Variables

### `cygni env add`

Add environment variable.

```bash
cygni env add KEY value
cygni env add DATABASE_URL "postgres://..." --production
cygni env add API_KEY "secret" --encrypted --production
```

Options:

- `--production` - Add to production environment
- `--preview` - Add to preview environment
- `--development` - Add to development environment
- `--encrypted` - Mark as sensitive (encrypted storage)

### `cygni env list`

List environment variables.

```bash
cygni env list
cygni env list --production
cygni env list --show-values  # Careful: shows decrypted values
```

### `cygni env remove`

Remove environment variable.

```bash
cygni env remove KEY
cygni env remove KEY --production
```

### `cygni env pull`

Download environment variables to .env file.

```bash
cygni env pull
cygni env pull --production --output .env.production
```

### `cygni env push`

Upload environment variables from .env file.

```bash
cygni env push .env
cygni env push .env.production --production
```

## Domain Management

### `cygni domains add`

Add a custom domain.

```bash
cygni domains add example.com
cygni domains add app.example.com
```

### `cygni domains list`

List all domains.

```bash
cygni domains list
cygni domains list --project my-app
```

### `cygni domains remove`

Remove a domain.

```bash
cygni domains remove example.com
```

### `cygni domains verify`

Verify domain DNS configuration.

```bash
cygni domains verify example.com
```

## Logs and Monitoring

### `cygni logs`

View application logs.

```bash
cygni logs
# View recent logs

cygni logs --follow
# Stream logs in real-time

cygni logs --since 1h
# Logs from last hour

cygni logs --deployment dep_123
# Logs for specific deployment

cygni logs --error
# Only error logs
```

Options:

- `--follow, -f` - Stream logs in real-time
- `--since TIME` - Show logs since time (e.g., 1h, 30m, 2d)
- `--until TIME` - Show logs until time
- `--deployment ID` - Logs for specific deployment
- `--build` - Show build logs
- `--error` - Only show errors

### `cygni metrics`

View application metrics.

```bash
cygni metrics
cygni metrics --period 24h
cygni metrics --metric cpu,memory
```

### `cygni performance`

View performance metrics.

```bash
cygni performance
cygni performance --last 1h
```

## Team Management

### `cygni team invite`

Invite team member.

```bash
cygni team invite email@example.com
cygni team invite email@example.com --role admin
```

### `cygni team list`

List team members.

```bash
cygni team list
```

### `cygni team remove`

Remove team member.

```bash
cygni team remove email@example.com
```

### `cygni team update`

Update team member role.

```bash
cygni team update email@example.com --role developer
```

## GitHub Integration

### `cygni github connect`

Connect GitHub account.

```bash
cygni github connect
```

### `cygni github disconnect`

Disconnect GitHub account.

```bash
cygni github disconnect
```

### `cygni github import`

Import GitHub repository.

```bash
cygni github import username/repo
cygni github import username/repo --branch main
```

## Webhooks

### `cygni webhooks create`

Create a webhook.

```bash
cygni webhooks create --url https://api.example.com/hook --events deployment.succeeded
```

### `cygni webhooks list`

List webhooks.

```bash
cygni webhooks list
```

### `cygni webhooks delete`

Delete a webhook.

```bash
cygni webhooks delete webhook_123
```

### `cygni webhooks test`

Test a webhook.

```bash
cygni webhooks test webhook_123
```

## API Tokens

### `cygni tokens create`

Create API token.

```bash
cygni tokens create --name "CI/CD"
cygni tokens create --name "GitHub Actions" --scope read
```

### `cygni tokens list`

List API tokens.

```bash
cygni tokens list
```

### `cygni tokens revoke`

Revoke API token.

```bash
cygni tokens revoke token_123
```

## Alerts

### `cygni alerts create`

Create an alert.

```bash
cygni alerts create --type error-rate --threshold 5% --email you@example.com
cygni alerts create --type response-time --threshold 1000ms --webhook https://...
```

### `cygni alerts list`

List alerts.

```bash
cygni alerts list
```

### `cygni alerts delete`

Delete an alert.

```bash
cygni alerts delete alert_123
```

## Utility Commands

### `cygni dashboard`

Open web dashboard.

```bash
cygni dashboard
```

### `cygni config`

Manage CLI configuration.

```bash
cygni config set default-team team_123
cygni config get default-team
cygni config list
```

### `cygni upgrade`

Upgrade CLI to latest version.

```bash
cygni upgrade
```

### `cygni help`

Show help information.

```bash
cygni help
cygni help deploy
cygni deploy --help
```

## Examples

### Deploy a Next.js App with Custom Domain

```bash
# Deploy the app
cd my-nextjs-app
cygni deploy --prod

# Add environment variables
cygni env add NEXT_PUBLIC_API_URL "https://api.example.com" --production
cygni env add DATABASE_URL "postgres://..." --production --encrypted

# Add custom domain
cygni domains add app.example.com

# View deployment
cygni status
```

### Set Up CI/CD with GitHub

```bash
# Connect GitHub
cygni github connect

# Import repository
cygni github import myusername/myapp

# Create API token for GitHub Actions
cygni tokens create --name "GitHub Actions"

# The token can be added as a GitHub secret
```

### Monitor Application

```bash
# View real-time logs
cygni logs --follow

# Check performance
cygni performance --last 1h

# Set up alerts
cygni alerts create --type error-rate --threshold 1% --email alerts@company.com

# View metrics dashboard
cygni dashboard
```
