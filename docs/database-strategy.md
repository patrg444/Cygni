# Cygni Database Strategy

## Overview
Cygni offers flexible database options to match different user needs and budgets.

## Database Providers

### 1. Cygni Managed (Default)
- **What**: PostgreSQL on AWS RDS / GCP CloudSQL
- **Pricing**: $0.02/hour for small (~$15/month)
- **Features**:
  - Automatic backups
  - Point-in-time recovery
  - Read replicas
  - Connection pooling via PgBouncer
  - Automatic SSL

### 2. Serverless Partners
- **Neon**: Serverless Postgres with branching
- **Turso**: Edge SQLite for read-heavy workloads
- **PlanetScale**: Serverless MySQL with branching

### 3. Bring Your Own Database
- Connect any database with a connection string
- Full control over configuration
- No Cygni management overhead

## Implementation

### Phase 1: Managed Postgres (Launch)
```yaml
# cygni.yaml
database:
  type: postgres
  size: small  # 2 vCPU, 4GB RAM
  storage: 20GB
  backups: 
    enabled: true
    retention: 7d
```

Maps to:
- **Dev/Preview**: Shared RDS instance with logical databases
- **Production**: Dedicated RDS instance
- **Connection pooling**: PgBouncer sidecar

### Phase 2: Partner Integration (Post-launch)
```typescript
class DatabaseProviderFactory {
  static async create(config: DatabaseConfig) {
    switch (config.provider) {
      case 'managed':
        return new ManagedPostgresProvider(config);
      case 'neon':
        return new NeonProvider(config);
      case 'turso':
        return new TursoProvider(config);
      case 'external':
        return new ExternalDatabaseProvider(config);
    }
  }
}
```

### Phase 3: Advanced Features
- Database branching for preview environments
- Automatic migrations
- Query performance insights
- Connection limits per plan

## Cost Structure

### Managed Databases
| Size | vCPU | RAM | Storage | Price/month |
|------|------|-----|---------|-------------|
| nano | 0.5 | 1GB | 10GB | $5 |
| small | 2 | 4GB | 20GB | $15 |
| medium | 4 | 8GB | 50GB | $35 |
| large | 8 | 16GB | 100GB | $75 |

### Partner Databases
- Pass-through pricing + 20% margin
- Example: Neon $20/month → Cygni $24/month

## Migration Path

Users can migrate between providers:
```bash
# Export from managed
cygni db export --format sql > backup.sql

# Import to Neon
cygni db import --provider neon --file backup.sql
```

## Why This Approach?

1. **Start Simple**: Launch with managed Postgres (proven, reliable)
2. **Add Choice**: Integrate partners based on user demand
3. **Maintain Control**: Always offer Cygni-managed option for better margins
4. **Developer Experience**: Same API regardless of provider

## Technical Implementation

### Database Provisioner Service
```go
type DatabaseProvisioner interface {
  Create(ctx context.Context, spec DatabaseSpec) (*Database, error)
  Delete(ctx context.Context, id string) error
  Backup(ctx context.Context, id string) (*Backup, error)
  Restore(ctx context.Context, id string, backupID string) error
}

type RDSProvisioner struct {
  rdsClient *rds.Client
  ec2Client *ec2.Client
}

func (p *RDSProvisioner) Create(ctx context.Context, spec DatabaseSpec) (*Database, error) {
  // 1. Create subnet group
  // 2. Create parameter group
  // 3. Create RDS instance
  // 4. Wait for available
  // 5. Create database and user
  // 6. Return connection details
}
```

### Connection Management
- Use PgBouncer for connection pooling
- Automatic SSL certificate management
- IP allowlisting for security
- Connection string encryption at rest

## Comparison with Competitors

| Feature | Cygni | Vercel | Railway | Render |
|---------|-------|---------|---------|---------|
| Managed Postgres | ✅ | Via partners | ✅ | ✅ |
| Serverless DB | Phase 2 | ✅ (Neon) | ❌ | ❌ |
| BYOD | ✅ | ✅ | ✅ | ✅ |
| Branching | Phase 2 | ✅ | ❌ | ❌ |
| Pricing | $5-75 | $20+ | $20+ | $15+ |