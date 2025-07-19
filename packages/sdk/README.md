# Cygni SDK for JavaScript/TypeScript

Official SDK for interacting with the Cygni API.

## Installation

```bash
npm install @cygni/sdk
# or
yarn add @cygni/sdk
# or
pnpm add @cygni/sdk
```

## Quick Start

```typescript
import { CygniClient } from '@cygni/sdk';

const client = new CygniClient({
  apiKey: 'your-api-key',
  // Optional configuration
  baseUrl: 'https://api.cygni.dev', // default
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
});

// Deploy a project
const deployment = await client.deploy('project-id', {
  environment: 'production',
  branch: 'main',
});

console.log('Deployment ID:', deployment.id);
```

## Authentication

Get your API key from the [Cygni Dashboard](https://app.cygni.dev/settings/api-keys).

```typescript
const client = new CygniClient({
  apiKey: process.env.CYGNI_API_KEY,
});
```

## API Reference

### Deployments

#### Deploy a project

```typescript
const deployment = await client.deploy('project-id', {
  environment: 'production', // optional
  branch: 'main', // optional
  buildId: 'existing-build-id', // optional, reuse existing build
});
```

#### Get deployment status

```typescript
const deployment = await client.getDeployment('deployment-id');
console.log('Status:', deployment.status); // 'pending' | 'deploying' | 'active' | 'failed'
```

#### List deployments

```typescript
const deployments = await client.getDeployments('project-id', {
  environment: 'production', // optional
  limit: 20, // optional, default 20
  offset: 0, // optional, for pagination
});
```

#### Rollback deployment

```typescript
const rollback = await client.rollback('deployment-id');
```

### Projects

#### List projects

```typescript
const projects = await client.listProjects('organization-id', {
  limit: 20,
  offset: 0,
});
```

#### Create project

```typescript
const project = await client.createProject('organization-id', {
  name: 'My App',
  framework: 'nextjs', // optional
  repository: 'https://github.com/user/repo', // optional
  description: 'My awesome app', // optional
});
```

#### Update project

```typescript
const updated = await client.updateProject('project-id', {
  name: 'New Name',
  framework: 'react',
});
```

#### Delete project

```typescript
await client.deleteProject('project-id');
```

### Environments

#### List environments

```typescript
const environments = await client.getEnvironments('project-id');
```

#### Update environment variables

```typescript
const environment = await client.updateEnvironment('environment-id', {
  NODE_ENV: 'production',
  API_URL: 'https://api.example.com',
});
```

### Secrets

#### List secrets

```typescript
const secrets = await client.listSecrets('project-id', 'environment-id');
// Note: Only returns secret keys, not values
```

#### Set secret

```typescript
const secret = await client.setSecret(
  'project-id',
  'environment-id',
  'SECRET_KEY',
  'secret-value'
);
```

#### Delete secret

```typescript
await client.deleteSecret('project-id', 'environment-id', 'SECRET_KEY');
```

### Builds

#### Get build status

```typescript
const build = await client.getBuild('build-id');
console.log('Status:', build.status); // 'pending' | 'running' | 'success' | 'failed'
```

#### Cancel build

```typescript
const cancelled = await client.cancelBuild('build-id');
```

### Logs

#### Get deployment logs

```typescript
const { logs } = await client.getLogs('deployment-id', {
  lines: 100, // optional, number of lines
  since: '2024-01-01T00:00:00Z', // optional, ISO timestamp
});

logs.forEach(log => {
  console.log(`[${log.timestamp}] ${log.message}`);
});
```

#### Stream logs (real-time)

```typescript
const stopStreaming = client.streamLogs('deployment-id', (log) => {
  console.log(log);
});

// Stop streaming
stopStreaming();
```

## Error Handling

The SDK uses typed errors for better error handling:

```typescript
try {
  await client.deploy('project-id');
} catch (error) {
  if (error.name === 'ValidationError') {
    console.error('Invalid request:', error.message);
  } else if (error.name === 'UnauthorizedError') {
    console.error('Invalid API key');
  } else if (error.name === 'NotFoundError') {
    console.error('Project not found');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Retry Logic

The SDK automatically retries failed requests with exponential backoff:

- Retries on 5xx errors and rate limiting (429)
- Default: 3 retries with exponential backoff
- Configurable via `maxRetries` and `retryDelay` options

```typescript
const client = new CygniClient({
  apiKey: 'your-api-key',
  maxRetries: 5, // Retry up to 5 times
  retryDelay: 2000, // Start with 2 second delay
});
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import { 
  CygniClient, 
  Deployment, 
  Project, 
  Environment,
  DeploymentStatus 
} from '@cygni/sdk';

// All responses are fully typed
const deployment: Deployment = await client.getDeployment('id');
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## License

MIT