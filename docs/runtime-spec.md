# Cygni Runtime Interface Specification

Version: 0.1  
Status: Draft  
Last Updated: 2025-07-20

## Overview

The Runtime Interface defines how Cygni detects, builds, and runs applications. Each runtime is described by a `runtime.yaml` file that specifies build commands, start scripts, health checks, and other deployment configuration.

## Specification

### Schema

```yaml
# runtime.yaml
version: 0.1
name: string # Runtime identifier (e.g., "node-20", "python-3.11")
detect: string | array # File(s) that must exist to use this runtime
build:
  install: string # Dependency installation command
  command: string # Build/compile command
run:
  start: string # Command to start the application
  port: number # Port the app listens on (default: 3000)
health:
  path: string # HTTP path for health checks (default: /health)
  interval: string # Check interval (e.g., "30s", "1m")
  timeout: string # Health check timeout (default: "10s")
  retries: number # Number of retries before unhealthy (default: 3)
env: # Optional environment variables
  NODE_ENV: production
```

### Fields

#### `version` (required)

- Type: `string`
- Current version: `0.1`
- Specifies the runtime spec version for compatibility

#### `name` (required)

- Type: `string`
- Examples: `node-20`, `python-3.11`, `go-1.21`
- Unique identifier for the runtime

#### `detect` (required)

- Type: `string` or `array`
- Examples: `package.json`, `["Gemfile", "Gemfile.lock"]`
- File(s) that must exist in the project root to auto-detect this runtime

#### `build` (required)

- Type: `object`
- Contains build-time configuration

##### `build.install` (optional)

- Type: `string`
- Example: `pnpm install --prod`
- Command to install dependencies

##### `build.command` (optional)

- Type: `string`
- Example: `pnpm build`
- Command to compile/build the application

#### `run` (required)

- Type: `object`
- Contains runtime configuration

##### `run.start` (required)

- Type: `string`
- Example: `node dist/index.js`
- Command to start the application

##### `run.port` (optional)

- Type: `number`
- Default: `3000`
- Port the application listens on

#### `health` (optional)

- Type: `object`
- Health check configuration

##### `health.path` (optional)

- Type: `string`
- Default: `/health`
- HTTP endpoint for health checks

##### `health.interval` (optional)

- Type: `string`
- Default: `30s`
- Time between health checks

##### `health.timeout` (optional)

- Type: `string`
- Default: `10s`
- Maximum time to wait for health check response

##### `health.retries` (optional)

- Type: `number`
- Default: `3`
- Failed checks before marking unhealthy

#### `env` (optional)

- Type: `object`
- Key-value pairs of environment variables

## Examples

### Node.js with Express

```yaml
version: 0.1
name: node-20
detect: package.json
build:
  install: pnpm install --prod
  command: pnpm build
run:
  start: node dist/index.js
  port: 3000
health:
  path: /health
  interval: 30s
```

### Next.js Application

```yaml
version: 0.1
name: nextjs-14
detect:
  - package.json
  - next.config.js
build:
  install: pnpm install
  command: pnpm build
run:
  start: pnpm start
  port: 3000
health:
  path: /api/health
  interval: 30s
env:
  NODE_ENV: production
```

### Python Flask

```yaml
version: 0.1
name: python-3.11
detect: requirements.txt
build:
  install: pip install -r requirements.txt
run:
  start: gunicorn app:app --bind 0.0.0.0:8000
  port: 8000
health:
  path: /health
  interval: 30s
```

## Validation

Use `cx validate runtime.yaml` to check if a runtime spec is valid:

```bash
$ cx validate runtime.yaml
✓ Runtime spec is valid

$ cx validate broken-runtime.yaml
✗ Validation failed:
  - missing required field: version
  - run.port must be a number
```

## Built-in Runtimes

Cygni ships with these pre-configured runtimes:

| Runtime       | Detection          | Description            |
| ------------- | ------------------ | ---------------------- |
| `node-20`     | `package.json`     | Node.js 20.x with pnpm |
| `node-18`     | `package.json`     | Node.js 18.x with pnpm |
| `nextjs-14`   | `next.config.js`   | Next.js 14+ optimized  |
| `python-3.11` | `requirements.txt` | Python 3.11 with pip   |
| `go-1.21`     | `go.mod`           | Go 1.21 with modules   |

## Custom Runtimes

To use a custom runtime, place `runtime.yaml` in your project root. Cygni will use it instead of auto-detection.

## Future Enhancements (v0.2+)

- Multi-stage builds
- Custom Dockerfile support
- Runtime composition/extends
- Pre/post hooks
- Resource limits (CPU/memory)
