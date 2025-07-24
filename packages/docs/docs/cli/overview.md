---
sidebar_position: 1
---

# CLI Overview

The Cygni CLI is your command-line interface for deploying and managing applications on the Cygni platform.

## Installation

### npm (Recommended)

```bash
npm install -g @cygni/cli
```

### Yarn

```bash
yarn global add @cygni/cli
```

### Homebrew (macOS)

```bash
brew tap cygni/tap
brew install cygni
```

## Authentication

Before using the CLI, authenticate with your Cygni account:

```bash
cygni login
```

This opens your browser for secure authentication. Your credentials are stored securely in your system's keychain.

To log out:

```bash
cygni logout
```

## Global Options

All commands support these global options:

- `--help, -h` - Show help for any command
- `--version, -v` - Show CLI version
- `--debug` - Enable debug output
- `--json` - Output in JSON format
- `--profile <name>` - Use a specific auth profile

## Command Structure

```bash
cygni <command> [options] [arguments]
```

### Examples

```bash
# Deploy current directory
cygni deploy

# Deploy with custom name
cygni deploy --name my-app

# Get help for deploy command
cygni deploy --help

# Use debug mode
cygni deploy --debug
```

## Configuration

The CLI stores configuration in `~/.cygni/config.json`:

```json
{
  "defaultRegion": "us-east-1",
  "analytics": true,
  "updateCheck": true
}
```

### Configuration Commands

```bash
# View current config
cygni config list

# Set a config value
cygni config set defaultRegion us-west-2

# Get a config value
cygni config get defaultRegion

# Reset to defaults
cygni config reset
```

## Profiles

Manage multiple accounts with profiles:

```bash
# Create a new profile
cygni login --profile work

# List profiles
cygni profiles list

# Switch profile
cygni profiles use work

# Delete profile
cygni profiles delete old-account
```

## Environment Detection

The CLI automatically detects your project type:

- **Next.js** - Detects `next.config.js`
- **React** - Detects `react` in package.json
- **Vue** - Detects `vue` in package.json
- **Express** - Detects Express patterns
- **Static** - HTML files with no framework

Override detection:

```bash
cygni deploy --framework nextjs
```

## Output Formats

### Default (Human-Readable)

```bash
cygni list
```

```
Projects:
  my-app     https://my-app.cygni.app     Active
  my-api     https://my-api.cygni.app     Active
  old-site   https://old-site.cygni.app   Inactive
```

### JSON Output

```bash
cygni list --json
```

```json
{
  "projects": [
    {
      "name": "my-app",
      "url": "https://my-app.cygni.app",
      "status": "active"
    }
  ]
}
```

## Auto-Updates

The CLI checks for updates automatically. Disable with:

```bash
cygni config set updateCheck false
```

Manual update:

```bash
npm update -g @cygni/cli
```

## Troubleshooting

### Debug Mode

Enable detailed logging:

```bash
export CYGNI_DEBUG=true
cygni deploy --debug
```

### Common Issues

**Authentication Failed**
```bash
# Clear credentials and re-login
cygni logout
cygni login
```

**Deploy Fails**
```bash
# Check build logs
cygni logs --build

# Validate project
cygni validate
```

**Network Issues**
```bash
# Use proxy
export HTTP_PROXY=http://proxy.company.com:8080
cygni deploy
```

## Next Steps

- Learn about [deploying applications](/docs/cli/deploy)
- Manage [environment variables](/docs/cli/env)
- Configure [custom domains](/docs/cli/domains)
- View [logs and metrics](/docs/cli/logs)